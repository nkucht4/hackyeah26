import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastrtc import Stream

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.features.emotions.service import (
    EmotionClassifier,
    UnconfiguredEmotionClassifier,
)
from app.features.speech.service import SpeechClassifier, create_speech_classifier
from app.features.speech.stream import SpeechAudioStreamHandler

logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    classifier: EmotionClassifier | None = None,
    speech_classifier: SpeechClassifier | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(title=app_settings.app_name)
    app.state.emotion_classifier = classifier or UnconfiguredEmotionClassifier()
    app.state.speech_classifier = (
        speech_classifier
        if speech_classifier is not None
        else create_speech_classifier(app_settings.speech_model_path)
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def log_speech_offer(request: Request, call_next):
        if request.url.path != "/api/v1/speech/webrtc/offer":
            return await call_next(request)

        trace_id = uuid.uuid4().hex[:8]
        started_at = time.perf_counter()
        logger.info(
            "DEBUG_VOICe offer_http_started trace=%s method=%s origin=%s",
            trace_id,
            request.method,
            request.headers.get("origin", "missing"),
        )
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "DEBUG_VOICe offer_http_failed trace=%s method=%s",
                trace_id,
                request.method,
            )
            raise

        logger.info(
            "DEBUG_VOICe offer_http_finished trace=%s method=%s status=%d elapsed_ms=%.1f",
            trace_id,
            request.method,
            response.status_code,
            (time.perf_counter() - started_at) * 1000,
        )
        return response

    app.include_router(api_router)
    speech_stream = Stream(
        handler=SpeechAudioStreamHandler(
            classifier=app.state.speech_classifier,
            window_seconds=app_settings.speech_window_seconds,
            sample_rate=app_settings.speech_sample_rate,
        ),
        modality="audio",
        mode="send",
    )
    speech_stream.mount(app, path="/api/v1/speech", tags=["speech"])
    return app


app = create_app()