from typing import Literal
from pydantic import BaseModel, Field


# --- 1. Multi-Turn Memory DTOs ---
class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class MultiTurnChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="Unique conversation ID")
    message: str = Field(..., min_length=1, description="New user message")
    system_prompt: str = Field(default="You are a helpful senior AI engineer.")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class TokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class MultiTurnChatResponse(BaseModel):
    session_id: str
    reply: str
    history_length: int
    usage: TokenUsage


# --- 2. Structured Output DTO ---
class ExtractRequest(BaseModel):
    text: str = Field(..., min_length=1)


class TicketExtraction(BaseModel):
    category: Literal["billing", "bug", "feature_request", "outage"]
    urgency: int = Field(..., ge=1, le=5, description="1 is lowest, 5 is critical")
    summary: str
    requires_human: bool


# --- 3. Tool Calling DTOs ---
class ToolChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class ToolChatResponse(BaseModel):
    reply: str
    tools_executed: list[str]
    usage: TokenUsage