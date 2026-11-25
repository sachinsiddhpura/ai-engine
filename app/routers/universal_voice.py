import os
import tempfile
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.schemas.universal_voice import UniversalRAGResponse, UniversalTextRAGRequest
from app.services.universal_voice_rag import universal_rag_service

router = APIRouter(
    prefix="/api/v1/universal-rag",
    tags=["Universal Multilingual Voice & Text RAG"],
)

@router.post("/ask-text", response_model=UniversalRAGResponse)
async def ask_any_language_text(request: UniversalTextRAGRequest):
    """
    Auto-detects the input text language, translates to English for Qdrant Hybrid RAG,
    translates the grounded answer back with preserved citations, and generates regional TTS audio.
    """
    try:
        result = await universal_rag_service.process_any_language(
            raw_text=request.query,
            include_audio=request.include_audio,
        )
        return UniversalRAGResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask-voice", response_model=UniversalRAGResponse)
async def ask_any_language_voice(
    audio_file: UploadFile = File(...),
    include_audio: bool = True,
):
    """
    Auto-detects the spoken language from an uploaded audio file (.wav, .mp3, .m4a),
    transcribes it via Faster-Whisper, runs Hybrid RAG, and replies in the same language + voice.
    """
    if not audio_file.filename:
        raise HTTPException(status_code=400, detail="Audio file is required.")

    suffix = os.path.splitext(audio_file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio_file.read())
        temp_audio_path = tmp.name

    try:
        # 1. Auto-detect spoken language and transcribe via Faster-Whisper
        transcript, detected_iso = universal_rag_service.speech_to_text_auto(temp_audio_path)
        if not transcript:
            raise HTTPException(status_code=400, detail="Could not transcribe speech from audio.")

        # 2. Run translation -> Hybrid RAG -> reverse translation -> dynamic TTS
        result = await universal_rag_service.process_any_language(
            raw_text=transcript,
            detected_iso=detected_iso,
            include_audio=include_audio,
        )
        return UniversalRAGResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Always remove temporary uploaded audio to protect patient PHI
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

@router.get("/audio/{filename}")
async def stream_generated_audio(filename: str):
    """Download or stream the generated MP3 response from generated_audio/."""
    safe_name = os.path.basename(filename)
    file_path = os.path.join("generated_audio", safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Generated audio file not found.")
    return FileResponse(file_path, media_type="audio/mpeg", filename=safe_name)