import asyncio
import json
from collections.abc import Mapping
from importlib import import_module
from pathlib import Path
from typing import Any, Protocol

import numpy as np
from numpy.typing import NDArray


class SpeechClassifier(Protocol):
    async def classify(
        self, audio: NDArray[np.float32], sample_rate: int
    ) -> Mapping[str, float]: ...


class PlaceholderSpeechClassifier:
    async def classify(
        self, audio: NDArray[np.float32], sample_rate: int
    ) -> Mapping[str, float]:
        return {"confidence": 72.0, "assertiveness": 64.0}


class LoadedSpeechClassifier:
    def __init__(
        self,
        torch: Any,
        processor: Any,
        encoder: Any,
        head: Any,
        device: Any,
        sample_rate: int,
        max_seconds: float,
    ) -> None:
        self._torch = torch
        self.processor = processor
        self.encoder = encoder
        self.head = head
        self.device = device
        self.sample_rate = sample_rate
        self.max_seconds = max_seconds

    async def classify(
        self, audio: NDArray[np.float32], sample_rate: int
    ) -> Mapping[str, float]:
        return await asyncio.to_thread(self._classify, audio, sample_rate)

    def _classify(
        self, audio: NDArray[np.float32], sample_rate: int
    ) -> Mapping[str, float]:
        if sample_rate <= 0:
            raise ValueError("sample_rate must be greater than zero")

        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if samples.size == 0:
            raise ValueError("audio must not be empty")
        samples = np.nan_to_num(samples, copy=False)

        if sample_rate != self.sample_rate:
            target_length = max(1, round(samples.size * self.sample_rate / sample_rate))
            source_positions = np.arange(samples.size, dtype=np.float64)
            target_positions = np.linspace(
                0, samples.size - 1, target_length, dtype=np.float64
            )
            samples = np.interp(target_positions, source_positions, samples).astype(
                np.float32
            )

        window_length = round(self.sample_rate * self.max_seconds)
        samples = samples[:window_length]
        if samples.size < window_length:
            samples = np.pad(samples, (0, window_length - samples.size))
        peak = np.max(np.abs(samples))
        if peak > 0:
            samples = samples / peak

        inputs = self.processor(
            samples,
            sampling_rate=self.sample_rate,
            return_tensors="pt",
            padding=True,
        )
        input_values = inputs.input_values.to(self.device)
        attention_mask = getattr(inputs, "attention_mask", None)
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.device)

        with self._torch.inference_mode():
            outputs = self.encoder(
                input_values=input_values,
                attention_mask=attention_mask,
            )
            pooled = outputs.last_hidden_state.mean(dim=1)
            confidence, assertiveness = self.head(pooled)

        return {
            "confidence": float(confidence.item()) * 100,
            "assertiveness": float(assertiveness.item()) * 100,
        }


def create_speech_classifier(model_path: Path | None) -> SpeechClassifier:
    if model_path is None:
        return PlaceholderSpeechClassifier()

    model_path = model_path.expanduser().resolve()
    if not model_path.is_dir():
        raise FileNotFoundError(f"Speech model directory does not exist: {model_path}")

    metadata_path = model_path / "config.json"
    head_path = model_path / "confidence_head.pt"
    if not metadata_path.is_file():
        raise FileNotFoundError(f"Speech model metadata not found: {metadata_path}")
    if not head_path.is_file():
        raise FileNotFoundError(f"Speech confidence head not found: {head_path}")

    with metadata_path.open(encoding="utf-8") as metadata_file:
        metadata = json.load(metadata_file)

    try:
        torch = import_module("torch")
        transformers = import_module("transformers")
    except ImportError as error:
        raise RuntimeError(
            'Speech inference requires the optional dependencies; install '
            'them with `pip install -e "backend[speech-model]"`.'
        ) from error

    nn = torch.nn
    Wav2Vec2Model = transformers.Wav2Vec2Model
    Wav2Vec2Processor = transformers.Wav2Vec2Processor

    encoder_name = metadata.get("encoder_name")
    if not isinstance(encoder_name, str) or not encoder_name:
        raise ValueError(f"Missing encoder_name in {metadata_path}")
    sample_rate = int(metadata.get("sampling_rate", 16_000))
    max_seconds = float(metadata.get("max_seconds", 2.0))
    if sample_rate <= 0 or max_seconds <= 0:
        raise ValueError("Speech model sampling_rate and max_seconds must be positive")

    encoder_path = model_path / "encoder"
    local_encoder_weights = any(
        (encoder_path / filename).is_file()
        for filename in (
            "model.safetensors",
            "pytorch_model.bin",
            "model.safetensors.index.json",
            "pytorch_model.bin.index.json",
        )
    )
    encoder = Wav2Vec2Model.from_pretrained(
        str(encoder_path) if local_encoder_weights else encoder_name,
        local_files_only=local_encoder_weights,
    )

    processor_path = model_path / "processor"
    local_processor_files = all(
        (processor_path / filename).is_file()
        for filename in ("preprocessor_config.json", "tokenizer_config.json", "vocab.json")
    )
    processor = Wav2Vec2Processor.from_pretrained(
        str(processor_path) if local_processor_files else encoder_name,
        local_files_only=local_processor_files,
    )

    class ConfidenceHead(nn.Module):
        def __init__(self, hidden_size: int) -> None:
            super().__init__()
            self.dropout = nn.Dropout(0.10)
            self.confidence = nn.Linear(hidden_size, 1)
            self.assertiveness = nn.Linear(hidden_size, 1)

        def forward(self, pooled: Any) -> tuple[Any, Any]:
            values = self.dropout(pooled)
            confidence = torch.sigmoid(self.confidence(values)).squeeze(-1)
            assertiveness = torch.sigmoid(self.assertiveness(values)).squeeze(-1)
            return confidence, assertiveness

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder.to(device).eval()
    head = ConfidenceHead(encoder.config.hidden_size).to(device)
    state_dict = torch.load(head_path, map_location=device, weights_only=True)
    head.load_state_dict(state_dict)
    head.eval()

    return LoadedSpeechClassifier(
        torch=torch,
        processor=processor,
        encoder=encoder,
        head=head,
        device=device,
        sample_rate=sample_rate,
        max_seconds=max_seconds,
    )