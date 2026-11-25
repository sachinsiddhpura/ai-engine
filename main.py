import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routers.chat import router as chat_router
from app.routers.rag import router as rag_router
from app.routers.agent import router as agent_router
from app.routers.ops import router as ops_router
from app.routers.multilingual import router as multilingual_router
from app.routers.universal_voice import router as universal_voice_router

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="Production AI Engine",
    description="Multi-turn memory, Structured Outputs, Native Tool Calling, RAG Pipeline, and ReAct MCP Agent",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(rag_router)
app.include_router(agent_router)
app.include_router(ops_router)
app.include_router(multilingual_router)
app.include_router(universal_voice_router)

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model": settings.model_name,
        "qdrant_url": settings.qdrant_url,
        "mcp_server_url": settings.mcp_server_url,
    }

# Serve the web console. Mounted last so it never shadows the API routes above.
app.mount("/", StaticFiles(directory="static", html=True), name="static")
