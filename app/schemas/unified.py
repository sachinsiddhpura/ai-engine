from typing import Literal
from pydantic import BaseModel

class ConversationSummary(BaseModel):
    id: str
    title: str
    updated_at: str

class UnifiedMessage(BaseModel):
    role: str
    content: str
    extra: dict | None = None
    created_at: str

class UnifiedSendResponse(BaseModel):
    conversation_id: str
    kind: Literal["chat", "rag", "voice"]
    reply: str
    extra: dict = {}
