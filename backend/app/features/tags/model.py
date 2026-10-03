import torch
from transformers import BertForSequenceClassification, BertTokenizer

MODEL_PATH = "./model"

PILLAR_MAPPING = {
    "authority_erosion": "authority",
    "emotional_overbuffering": "buffering",
    "impact_minimization": "minimizer",
    "submissive_framing": "submissive",
}

_tokenizer = None
_model = None

def _load_model():
    global _tokenizer, _model
    if _tokenizer is None or _model is None:
        _tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
        _model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
        _model.eval()


def get_tags(
    text: str, confidence_threshold: float = 0.40
) -> list[dict[str, str]]:
    """Classifies a faulty sentence and returns only the broken pillar tags and their confidence scores.
    Returns:
        [
            {"tag": "authority", "confidence": "92.99%"},
            {"tag": "submissive", "confidence": "90.03%"}
        ]
    """
    _load_model()

    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=128)

    with torch.no_grad():
        logits = _model(**inputs).logits
        probs = torch.sigmoid(logits)[0].tolist()

    pillar_keys = list(PILLAR_MAPPING.keys())
    results = []

    for idx, key in enumerate(pillar_keys):
        if probs[idx] >= confidence_threshold:
            score = round(probs[idx] * 100, 2)
            results.append(
                {"tag": PILLAR_MAPPING[key], "confidence": f"{score}%"}
            )

    results.sort(
        key=lambda x: float(x["confidence"].replace("%", "")), reverse=True
    )

    return results