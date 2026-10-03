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

class CorrectionItem(BaseModel):
    original: str = Field(description="Exact weak phrase found in the text")
    suggested: str = Field(description="Confident and professional replacement")
    reason: str = Field(description="Short explanation of why this weakens the message")
    start: int
    end: int
    
class CorrectionResponse(BaseModel):
    corrections: list[CorrectionItem]

