from pydantic import BaseModel, Field

class AgentRunRequest(BaseModel):
    goal: str = Field(..., min_length=3, description="Complex multi-step goal for the agent")

class ToolStep(BaseModel):
    tool_name: str
    arguments: dict
    output: str

class AgentRunResponse(BaseModel):
    goal: str
    final_answer: str
    steps_taken: list[ToolStep]