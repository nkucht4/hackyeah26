import asyncio
import logging
import time
import uuid

import numpy as np
from app.features.speech.schemas import SpeechClassificationEvent
from app.features.speech.service import SpeechClassifier
from fastrtc import AsyncStreamHandler
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


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
        self._stream_id = uuid.uuid4().hex[:8]
        self._received_frames = 0
        self._classified_windows = 0
        self._idle_emit_logged = False
        logger.info(
            "DEBUG_VOICe stream_handler_created stream=%s window_seconds=%.2f target_sample_rate=%d",
            self._stream_id,
            window_seconds,
            sample_rate,
        )

    async def receive(self, frame: tuple[int, NDArray[np.int16]]) -> None:
        sample_rate, audio = frame
        self._received_frames += 1
        pending_before = self.buffer.pending_samples
        try:
            windows = self.buffer.append(audio, sample_rate)
        except Exception:
            logger.exception(
                "DEBUG_VOICe audio_buffer_failed stream=%s frame=%d sample_rate=%d frame_samples=%d",
                self._stream_id,
                self._received_frames,
                sample_rate,
                len(audio),
            )
            raise

        pending_after = self.buffer.pending_samples
        crossed_second = (
            pending_after // sample_rate > pending_before // sample_rate
        )
        if self._received_frames == 1 or windows or crossed_second:
            logger.info(
                "DEBUG_VOICe audio_received stream=%s frame=%d sample_rate=%d frame_samples=%d pending_samples=%d pending_seconds=%.2f completed_windows=%d",
                self._stream_id,
                self._received_frames,
                sample_rate,
                len(audio),
                pending_after,
                pending_after / sample_rate,
                len(windows),
            )
        else:
            logger.debug(
                "DEBUG_VOICe audio_frame stream=%s frame=%d sample_rate=%d frame_samples=%d pending_samples=%d",
                self._stream_id,
                self._received_frames,
                sample_rate,
                len(audio),
                pending_after,
            )

        for window in windows:
            self._classified_windows += 1
            started_at = time.perf_counter()
            logger.info(
                "DEBUG_VOICe classification_started stream=%s window=%d samples=%d sample_rate=%d",
                self._stream_id,
                self._classified_windows,
                len(window),
                sample_rate,
            )
            try:
                scores = await self.classifier.classify(window, sample_rate)
                event = SpeechClassificationEvent(**scores)
                message = event.model_dump_json()
            except Exception:
                logger.exception(
                    "DEBUG_VOICe classification_failed stream=%s window=%d",
                    self._stream_id,
                    self._classified_windows,
                )
                raise

            logger.info(
                "DEBUG_VOICe classification_succeeded stream=%s window=%d elapsed_ms=%.1f confidence=%.2f assertiveness=%.2f",
                self._stream_id,
                self._classified_windows,
                (time.perf_counter() - started_at) * 1000,
                event.confidence,
                event.assertiveness,
            )
            try:
                await self.send_message(message)
            except Exception:
                logger.exception(
                    "DEBUG_VOICe score_send_failed stream=%s window=%d",
                    self._stream_id,
                    self._classified_windows,
                )
                raise
            logger.info(
                "DEBUG_VOICe score_sent stream=%s window=%d",
                self._stream_id,
                self._classified_windows,
            )

    async def emit(self) -> None:
        if not self._idle_emit_logged:
            logger.info(
                "DEBUG_VOICe output_idle stream=%s; score responses use the data channel",
                self._stream_id,
            )
            self._idle_emit_logged = True
        await asyncio.sleep(0.1)

    def copy(self) -> "SpeechAudioStreamHandler":
        return SpeechAudioStreamHandler(
            classifier=self.classifier,
            window_seconds=self.window_seconds,
            sample_rate=self.sample_rate,
        )