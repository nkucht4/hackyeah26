from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.features.emotions.service import EmotionClassifier, UnconfiguredEmotionClassifier


def create_app(
    settings: Settings | None = None,
    classifier: EmotionClassifier | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(title=app_settings.app_name)
    app.state.emotion_classifier = classifier or UnconfiguredEmotionClassifier()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(api_router)
    return app


app = create_app()