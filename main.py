import logging
from fastapi import FastAPI
from app.config import settings
from app.routers.chat import router as chat_router
from app.routers.rag import router as rag_router
from app.routers.agent import router as agent_router

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="Production AI Engine - Step 1",
    description="Multi-turn memory, Structured Outputs, and Native Tool Calling",
    version="1.0.0",
)

app.include_router(chat_router)
app.include_router(rag_router)
app.include_router(agent_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "model": settings.model_name}