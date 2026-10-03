from pydantic import BaseModel, Field, FiniteFloat, field_validator


class EmotionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)

    @field_validator("text")
    @classmethod
    def require_nonblank_text(cls, text: str) -> str:
        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("text must contain non-whitespace characters")
        return normalized_text


class EmotionResponse(BaseModel):
    scores: dict[str, FiniteFloat]

    @field_validator("scores")
    @classmethod
    def require_named_scores(cls, scores: dict[str, FiniteFloat]) -> dict[str, FiniteFloat]:
        if not scores or any(not emotion.strip() for emotion in scores):
            raise ValueError("scores must contain at least one named emotion")
        return scores
