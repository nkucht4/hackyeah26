from collections.abc import Mapping
from typing import Protocol


class EmotionModelNotConfigured(Exception):
    pass


class EmotionClassifier(Protocol):
    async def classify(self, text: str) -> Mapping[str, float]: ...


class UnconfiguredEmotionClassifier:
    async def classify(self, text: str) -> Mapping[str, float]:
        raise EmotionModelNotConfigured