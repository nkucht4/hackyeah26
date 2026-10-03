import asyncio
import json
from collections.abc import Mapping
from contextlib import nullcontext
from types import SimpleNamespace

import numpy as np
import pytest
from app.core.config import Settings
from app.features.speech.schemas import SpeechClassificationEvent
from app.features.speech.service import (
    LoadedSpeechClassifier,
    PlaceholderSpeechClassifier,
    create_speech_classifier,
)
from app.features.speech.stream import AudioWindowBuffer, SpeechAudioStreamHandler
from app.main import create_app
from fastapi.testclient import TestClient
from pydantic import ValidationError


class FakeSpeechClassifier:
    def __init__(self) -> None:
        self.windows: list[tuple[int, int]] = []

    async def classify(
        self, audio: np.ndarray, sample_rate: int
    ) -> Mapping[str, float]:
        self.windows.append((len(audio), sample_rate))
        return {"confidence": 72.0, "assertiveness": 64.0}


class FakeDataChannel:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def send(self, message: str) -> None:
        self.messages.append(message)


def test_audio_window_buffer_splits_windows_and_retains_remainder() -> None:
    buffer = AudioWindowBuffer(window_seconds=2.0)

    assert buffer.append(np.ones(31_999, dtype=np.int16), 16_000) == []
    windows = buffer.append(np.ones(32_002, dtype=np.int16), 16_000)

    assert [len(window) for window in windows] == [32_000, 32_000]
    assert buffer.pending_samples == 1
    assert np.max(np.abs(windows[0])) == 1.0


def test_audio_window_buffer_rejects_sample_rate_changes() -> None:
    buffer = AudioWindowBuffer()
    buffer.append(np.zeros(10, dtype=np.int16), 16_000)

    with pytest.raises(ValueError, match="sample rate changed"):
        buffer.append(np.zeros(10, dtype=np.int16), 48_000)


def test_handler_classifies_only_complete_windows_and_sends_scores() -> None:
    classifier = FakeSpeechClassifier()
    handler = SpeechAudioStreamHandler(classifier)
    channel = FakeDataChannel()
    handler.set_channel(channel)  # type: ignore[arg-type]

    async def receive_chunks() -> None:
        await handler.receive((16_000, np.zeros(31_999, dtype=np.int16)))
        assert channel.messages == []
        await handler.receive((16_000, np.zeros(1, dtype=np.int16)))

    asyncio.run(receive_chunks())

    assert classifier.windows == [(32_000, 16_000)]
    assert json.loads(channel.messages[0]) == {
        "type": "speech.classification",
        "confidence": 72.0,
        "assertiveness": 64.0,
    }


def test_handler_classifies_each_completed_window() -> None:
    classifier = FakeSpeechClassifier()
    handler = SpeechAudioStreamHandler(classifier)
    channel = FakeDataChannel()
    handler.set_channel(channel)  # type: ignore[arg-type]

    asyncio.run(handler.receive((16_000, np.zeros(64_000, dtype=np.int16))))

    assert classifier.windows == [(32_000, 16_000), (32_000, 16_000)]
    assert len(channel.messages) == 2


def test_handler_copy_has_an_independent_audio_buffer() -> None:
    classifier = FakeSpeechClassifier()
    first = SpeechAudioStreamHandler(classifier)
    second = first.copy()

    first.buffer.append(np.zeros(100, dtype=np.int16), 16_000)

    assert first.buffer.pending_samples == 100
    assert second.buffer.pending_samples == 0


def test_placeholder_classifier_returns_fixed_scores() -> None:
    classifier = PlaceholderSpeechClassifier()

    scores = asyncio.run(classifier.classify(np.zeros(32_000, dtype=np.float32), 16_000))

    assert scores == {"confidence": 72.0, "assertiveness": 64.0}


def test_loaded_classifier_resamples_and_returns_percentages() -> None:
    class FakeTensor:
        def __init__(self, value: float | None = None) -> None:
            self.value = value

        def to(self, device: object) -> "FakeTensor":
            return self

        def item(self) -> float:
            assert self.value is not None
            return self.value

    class FakeProcessor:
        def __init__(self) -> None:
            self.audio: np.ndarray | None = None
            self.sample_rate: int | None = None

        def __call__(self, audio: np.ndarray, **kwargs: object) -> SimpleNamespace:
            self.audio = audio
            self.sample_rate = kwargs["sampling_rate"]  # type: ignore[assignment]
            return SimpleNamespace(input_values=FakeTensor(), attention_mask=None)

    class FakeEncoder:
        def __call__(self, **kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(last_hidden_state=SimpleNamespace(mean=lambda dim: "pooled"))

    class FakeHead:
        def __call__(self, pooled: str) -> tuple[FakeTensor, FakeTensor]:
            assert pooled == "pooled"
            return FakeTensor(0.84), FakeTensor(0.63)

    processor = FakeProcessor()
    classifier = LoadedSpeechClassifier(
        torch=SimpleNamespace(inference_mode=nullcontext),
        processor=processor,
        encoder=FakeEncoder(),
        head=FakeHead(),
        device="cpu",
        sample_rate=8,
        max_seconds=1.0,
    )

    scores = asyncio.run(
        classifier.classify(np.array([0.0, 0.5, 1.0], dtype=np.float32), 4)
    )

    assert scores == {"confidence": 84.0, "assertiveness": 63.0}
    assert processor.sample_rate == 8
    np.testing.assert_allclose(
        processor.audio,
        np.array([0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 0.0, 0.0], dtype=np.float32),
    )


def test_speech_classifier_rejects_missing_model_directory(tmp_path) -> None:
    with pytest.raises(FileNotFoundError, match="Speech model directory"):
        create_speech_classifier(tmp_path / "missing")


def test_speech_classifier_requires_model_metadata(tmp_path) -> None:
    with pytest.raises(FileNotFoundError, match="Speech model metadata"):
        create_speech_classifier(tmp_path)


def test_speech_scores_are_limited_to_finite_percentages() -> None:
    event = SpeechClassificationEvent(confidence=72.0, assertiveness=64.0)

    assert event.confidence == 72.0
    assert event.assertiveness == 64.0
    with pytest.raises(ValidationError):
        SpeechClassificationEvent(confidence=101.0, assertiveness=64.0)


def test_fast_rtc_offer_endpoint_is_mounted() -> None:
    app = create_app(settings=Settings(), speech_classifier=FakeSpeechClassifier())
    client = TestClient(app)

    response = client.post("/api/v1/speech/webrtc/offer", json={})

    assert response.status_code == 422