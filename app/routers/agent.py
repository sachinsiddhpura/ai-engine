from fastapi import APIRouter, HTTPException
from app.schemas.agent import AgentRunRequest, AgentRunResponse
from app.services.agent_service import agent_service

router = APIRouter(prefix="/api/v1/agent", tags=["Agentic MCP"])

@router.post("/run", response_model=AgentRunResponse)
async def execute_agent(request: AgentRunRequest):
    try:
        return await agent_service.run_agent(request.goal)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))