import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.routers.auth import get_current_user
from app.schemas.rag import RAGQueryRequest
from app.schemas.unified import ConversationSummary, UnifiedMessage, UnifiedSendResponse
from app.services.chat_history_service import chat_history_service
from app.services.llm_service import llm_service
from app.services.rag_service_parent import rag_service_parent
from app.services.universal_voice_rag import universal_rag_service

router = APIRouter(prefix="/api/v1/unified", tags=["Unified Chat"])

AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac"}

UNIFIED_SYSTEM_PROMPT = (
    "You are a helpful, concise AI assistant with access to a check_service_health "
    "tool for live backend microservice status. Use it whenever the user asks about "
    "a system or service's health, uptime, or latency."
)


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(username: str = Depends(get_current_user)):
    return chat_history_service.list_conversations(username)


@router.post("/conversations", response_model=ConversationSummary)
def create_conversation(username: str = Depends(get_current_user)):
    conversation_id = chat_history_service.create_conversation(username)
    return ConversationSummary(id=conversation_id, title="New chat", updated_at="")


@router.get("/conversations/{conversation_id}/messages", response_model=list[UnifiedMessage])
def get_messages(conversation_id: str, username: str = Depends(get_current_user)):
    if not chat_history_service.owns_conversation(conversation_id, username):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return chat_history_service.get_messages(conversation_id)


@router.post("/send", response_model=UnifiedSendResponse)
async def send(
    conversation_id: str | None = Form(default=None),
    message: str = Form(default=""),
    include_audio: bool = Form(default=True),
    file: UploadFile | None = File(default=None),
    username: str = Depends(get_current_user),
):
    if conversation_id and not chat_history_service.owns_conversation(conversation_id, username):
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not conversation_id:
        conversation_id = chat_history_service.create_conversation(username)

    try:
        if file is not None and file.filename:
            ext = Path(file.filename).suffix.lower()
            file_bytes = await file.read()

            if ext == ".pdf":
                kind, reply, extra = await _handle_pdf(conversation_id, file.filename, file_bytes, message)
            elif ext in AUDIO_EXTENSIONS:
                kind, reply, extra = await _handle_audio(
                    conversation_id, file.filename, file_bytes, include_audio
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported attachment type: {ext}")
        else:
            kind, reply, extra = await _handle_chat(conversation_id, message)

        return UnifiedSendResponse(conversation_id=conversation_id, kind=kind, reply=reply, extra=extra)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _handle_chat(conversation_id: str, message: str) -> tuple[str, str, dict]:
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message text is required.")

    history = [{"role": "system", "content": UNIFIED_SYSTEM_PROMPT}]
    history += chat_history_service.chat_messages_for_llm(conversation_id)

    chat_history_service.add_message(conversation_id, "user", message)
    chat_history_service.maybe_set_title(conversation_id, message)

    result = await llm_service.chat_unified(history, message)

    extra = {"tools_executed": result["tools_executed"]}
    chat_history_service.add_message(conversation_id, "assistant", result["reply"], extra)
    return "chat", result["reply"], extra


async def _handle_pdf(
    conversation_id: str, filename: str, file_bytes: bytes, message: str
) -> tuple[str, str, dict]:
    user_text = message.strip() or f"📎 Uploaded {filename}"
    chat_history_service.add_message(conversation_id, "user", user_text, {"attachment": filename})
    chat_history_service.maybe_set_title(conversation_id, user_text)

    ingest_res = await rag_service_parent.ingest_pdf(filename, file_bytes)

    if message.strip():
        rag_res = await rag_service_parent.query(RAGQueryRequest(question=message))
        reply = rag_res.answer
        extra = {
            "sources": [s.model_dump() for s in rag_res.sources],
            "ingested": ingest_res.model_dump(),
        }
    else:
        reply = (
            f'✅ Ingested "{ingest_res.filename}" — {ingest_res.pages_processed} pages, '
            f"{ingest_res.chunks_indexed} chunks indexed. Ask me anything about it."
        )
        extra = {"ingested": ingest_res.model_dump()}

    chat_history_service.add_message(conversation_id, "assistant", reply, extra)
    return "rag", reply, extra


async def _handle_audio(
    conversation_id: str, filename: str, file_bytes: bytes, include_audio: bool
) -> tuple[str, str, dict]:
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        temp_path = tmp.name

    try:
        transcript, detected_iso = universal_rag_service.speech_to_text_auto(temp_path)
        if not transcript:
            raise HTTPException(status_code=400, detail="Could not transcribe speech from audio.")

        chat_history_service.add_message(conversation_id, "user", transcript, {"attachment": filename})
        chat_history_service.maybe_set_title(conversation_id, transcript)

        result = await universal_rag_service.process_any_language(
            raw_text=transcript, detected_iso=detected_iso, include_audio=include_audio
        )
        extra = {
            "citations": result["citations"],
            "detected_language": result["detected_language"],
            "audio_output_path": result["audio_output_path"],
        }
        chat_history_service.add_message(conversation_id, "assistant", result["localized_answer"], extra)
        return "voice", result["localized_answer"], extra
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
