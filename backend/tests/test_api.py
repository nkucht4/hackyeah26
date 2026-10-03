from collections.abc import Mapping

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.features.emotions.service import EmotionClassifier
from app.main import create_app


class FakeEmotionClassifier:
    async def classify(self, text: str) -> Mapping[str, float]:
        assert text == "I feel good"
        return {"joy": 0.8, "sadness": 0.2}


@pytest.fixture
def settings() -> Settings:
    return Settings(
        cors_origins=(
            "http://localhost:3000,"
            "http://127.0.0.1:3000,"
            "chrome-extension://test-extension-id"
        )
    )


def test_health_check(settings: Settings) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_emotion_classification_returns_scores(settings: Settings) -> None:
    classifier: EmotionClassifier = FakeEmotionClassifier()
    client = TestClient(create_app(settings=settings, classifier=classifier))

    response = client.post(
        "/api/v1/emotions/classify",
        json={"text": "  I feel good  "},
    )

    assert response.status_code == 200
    assert response.json() == {"scores": {"joy": 0.8, "sadness": 0.2}}


def test_correction_returns_placeholder_text(settings: Settings) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.post("/api/v1/correction", json={"text": "Fix this sentence."})

    assert response.status_code == 200
    assert response.json() == {"corrected_text": "Placeholder text"}


def test_correction_rejects_blank_text(settings: Settings) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.post("/api/v1/correction", json={"text": "   "})

    assert response.status_code == 422


def test_emotion_classification_is_unavailable_without_model(settings: Settings) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.post("/api/v1/emotions/classify", json={"text": "I feel good"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Emotion classification model is not configured"
    }


@pytest.mark.parametrize("text", ["", "   "])
def test_emotion_classification_rejects_blank_text(settings: Settings, text: str) -> None:
    client = TestClient(create_app(settings=settings, classifier=FakeEmotionClassifier()))

    response = client.post("/api/v1/emotions/classify", json={"text": text})

    assert response.status_code == 422


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "chrome-extension://test-extension-id"],
)
def test_cors_allows_configured_origins(settings: Settings, origin: str) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.options(
        "/api/v1/emotions/classify",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers


def test_cors_rejects_unconfigured_origins(settings: Settings) -> None:
    client = TestClient(create_app(settings=settings))

    response = client.options(
        "/api/v1/emotions/classify",
        headers={
            "Origin": "https://unconfigured.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers