from fastapi import APIRouter, Depends

from app.features.correction.controller import process_correction
from app.features.correction.schemas import CorrectionRequest, CorrectionResponse
from app.features.correction.service import CorrectionService

router = APIRouter(prefix="/api/v1/correction", tags=["correction"])


def get_correction_service() -> CorrectionService:
    return CorrectionService()


@router.post("", response_model=CorrectionResponse)
async def correct_text(
    payload: CorrectionRequest,
    service: CorrectionService = Depends(get_correction_service),
) -> CorrectionResponse:
    return await process_correction(payload, service)