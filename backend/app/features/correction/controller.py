from app.features.correction.schemas import CorrectionRequest, CorrectionResponse
from app.features.correction.service import CorrectionService


async def process_correction(
    payload: CorrectionRequest,
    service: CorrectionService,
) -> CorrectionResponse:
    corrections = await service.correct_text(payload.text)
    return corrections