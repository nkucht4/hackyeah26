from fastapi import APIRouter

from app.api.health import router as health_router
from app.features.emotions.router import router as emotions_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(emotions_router)