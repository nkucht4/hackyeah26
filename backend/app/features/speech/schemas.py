from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat


class SpeechClassificationEvent(BaseModel):
    type: Literal["speech.classification"] = "speech.classification"
    confidence: FiniteFloat = Field(ge=0, le=100)
    assertiveness: FiniteFloat = Field(ge=0, le=100)