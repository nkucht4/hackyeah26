from app.features.correction.schemas import CorrectionRequest, CorrectionResponse
from app.features.correction.service import CorrectionService


async def process_correction(
    payload: CorrectionRequest,
    service: CorrectionService,
) -> CorrectionResponse:
    corrected_text = await service.correct_text(payload.text)
    return CorrectionResponse(corrected_text=corrected_text)