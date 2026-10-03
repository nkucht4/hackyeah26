from fastapi import FastAPI
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
    app.include_router(api_router)
    speech_stream = Stream(
        handler=SpeechAudioStreamHandler(
            classifier=app.state.speech_classifier,
            window_seconds=app_settings.speech_window_seconds,
            sample_rate=app_settings.speech_sample_rate,
        ),
        modality="audio",
        mode="receive",
    )
    speech_stream.mount(app, path="/api/v1/speech", tags=["speech"])
    return app


app = create_app()