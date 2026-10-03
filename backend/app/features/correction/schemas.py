from pydantic import BaseModel, Field, field_validator


class CorrectionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)

    @field_validator("text")
    @classmethod
    def require_nonblank_text(cls, text: str) -> str:
        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("text must contain non-whitespace characters")
        return normalized_text


class CorrectionResponse(BaseModel):
    corrected_text: str