import numpy as np
from app.features.speech.schemas import SpeechClassificationEvent
from app.features.speech.service import SpeechClassifier
from fastrtc import AsyncStreamHandler
from numpy.typing import NDArray


class AudioWindowBuffer:
    def __init__(self, window_seconds: float = 2.0) -> None:
        if window_seconds <= 0:
            raise ValueError("window_seconds must be greater than zero")
        self.window_seconds = window_seconds
        self._sample_rate: int | None = None
        self._pending = np.empty(0, dtype=np.float32)

    @property
    def pending_samples(self) -> int:
        return len(self._pending)

    def append(
        self, audio: NDArray[np.generic], sample_rate: int
    ) -> list[NDArray[np.float32]]:
        if sample_rate <= 0:
            raise ValueError("sample_rate must be greater than zero")
        if self._sample_rate is None:
            self._sample_rate = sample_rate
        elif self._sample_rate != sample_rate:
            raise ValueError("sample rate changed during an audio stream")

        samples = np.asarray(audio)
        if samples.ndim > 1:
            samples = samples.reshape(-1)
        if np.issubdtype(samples.dtype, np.integer):
            samples = samples.astype(np.float32) / np.iinfo(samples.dtype).max
        else:
            samples = samples.astype(np.float32, copy=False)

        self._pending = np.concatenate((self._pending, samples))
        window_size = max(1, round(sample_rate * self.window_seconds))
        windows: list[NDArray[np.float32]] = []
        while len(self._pending) >= window_size:
            window = self._pending[:window_size]
            peak = np.max(np.abs(window))
            if peak > 0:
                window = window / peak
            windows.append(window.astype(np.float32, copy=False))
            self._pending = self._pending[window_size:]
        return windows


class SpeechAudioStreamHandler(AsyncStreamHandler):
    def __init__(
        self,
        classifier: SpeechClassifier,
        window_seconds: float = 2.0,
        sample_rate: int = 16_000,
    ) -> None:
        super().__init__(expected_layout="mono", input_sample_rate=sample_rate)
        self.classifier = classifier
        self.window_seconds = window_seconds
        self.sample_rate = sample_rate
        self.buffer = AudioWindowBuffer(window_seconds)

    async def receive(self, frame: tuple[int, NDArray[np.int16]]) -> None:
        sample_rate, audio = frame
        for window in self.buffer.append(audio, sample_rate):
            scores = await self.classifier.classify(window, sample_rate)
            event = SpeechClassificationEvent(**scores)
            await self.send_message(event.model_dump_json())

    async def emit(self) -> None:
        return None

    def copy(self) -> "SpeechAudioStreamHandler":
        return SpeechAudioStreamHandler(
            classifier=self.classifier,
            window_seconds=self.window_seconds,
            sample_rate=self.sample_rate,
        )