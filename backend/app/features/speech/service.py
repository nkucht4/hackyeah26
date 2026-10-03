from collections.abc import Mapping
from pathlib import Path
from typing import Protocol

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


def create_speech_classifier(model_path: Path | None) -> SpeechClassifier:
    if model_path is not None:
        # TODO: Load Wav2Vec2Model and Wav2Vec2Processor from encoder/ and processor/.
        # TODO: Recreate the notebook's ConfidenceHead and load confidence_head.pt.
        # TODO: Run normalized 16 kHz windows and scale both sigmoid outputs to 0-100.
        raise NotImplementedError(
            "PyTorch speech-model loading is not implemented yet"
        )
    return PlaceholderSpeechClassifier()