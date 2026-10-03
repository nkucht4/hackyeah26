from collections.abc import Mapping

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.features.emotions.schemas import EmotionRequest, EmotionResponse
from app.features.emotions.service import (
    EmotionClassifier,
    EmotionModelNotConfigured,
)

router = APIRouter(prefix="/api/v1/emotions", tags=["emotions"])


def get_emotion_classifier(request: Request) -> EmotionClassifier:
    return request.app.state.emotion_classifier


@router.post("/classify", response_model=EmotionResponse)
async def classify_emotions(
    payload: EmotionRequest,
    classifier: EmotionClassifier = Depends(get_emotion_classifier),
) -> EmotionResponse:
    try:
        scores: Mapping[str, float] = await classifier.classify(payload.text)
    except EmotionModelNotConfigured as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Emotion classification model is not configured",
        ) from error
    return EmotionResponse(scores=scores)