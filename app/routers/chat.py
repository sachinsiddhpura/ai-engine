from fastapi import APIRouter, HTTPException
from app.schemas.chat import (
    ExtractRequest,
    MultiTurnChatRequest,
    MultiTurnChatResponse,
    TicketExtraction,
    ToolChatRequest,
    ToolChatResponse,
)
from app.services.llm_service import llm_service

router = APIRouter(prefix="/api/v1/ai", tags=["AI Engine"])


@router.post("/chat", response_model=MultiTurnChatResponse)
async def multi_turn_chat(request: MultiTurnChatRequest):
    try:
        return await llm_service.chat_with_memory(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract", response_model=TicketExtraction)
async def extract_structured_data(request: ExtractRequest):
    try:
        return await llm_service.extract_ticket(request.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent-chat", response_model=ToolChatResponse)
async def tool_calling_chat(request: ToolChatRequest):
    try:
        return await llm_service.chat_with_tools(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))