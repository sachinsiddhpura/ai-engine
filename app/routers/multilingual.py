import os
import tempfile
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.schemas.multilingul import GujaratiTextRAGRequest, MultilingualRAGResponse
from app.services.voice_transalation import voice_translation_service

router = APIRouter(prefix="/api/v1/multilingual", tags=["Gujarati Voice & Translation RAG"])

@router.post("/ask-gujarati-text", response_model=MultilingualRAGResponse)
async def ask_in_gujarati_text(request: GujaratiTextRAGRequest):
    """Accept a Gujarati text question, query English Qdrant RAG, and return Gujarati text + audio."""
    try:
        return await voice_translation_service.run_gujarati_rag_pipeline(
            gujarati_query=request.gujarati_question,
            include_audio=request.include_audio,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask-gujarati-voice", response_model=MultilingualRAGResponse)
async def ask_in_gujarati_voice(audio_file: UploadFile = File(...), include_audio: bool = True):
    """Accept a spoken Gujarati audio file (.wav/.mp3), transcribe via Whisper, run RAG, and reply in Gujarati."""
    if not audio_file.filename:
        raise HTTPException(status_code=400, detail="Audio file is required.")

    # Save uploaded audio stream to a temporary disk file for Faster-Whisper
    suffix = os.path.splitext(audio_file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio_file.read())
        temp_audio_path = tmp.name

    try:
        # Stage A: Speech-to-Text (Gujarati Audio -> Gujarati Text)
        gujarati_text = voice_translation_service.speech_to_gujarati_text(temp_audio_path)
        if not gujarati_text:
            raise HTTPException(status_code=400, detail="Could not transcribe speech from audio.")

        # Stages B -> C -> D -> E: Translate -> Hybrid RAG -> Translate Back -> TTS
        return await voice_translation_service.run_gujarati_rag_pipeline(
            gujarati_query=gujarati_text,
            include_audio=include_audio,
        )
    finally:
        # Always delete the temporary uploaded audio file to protect patient privacy
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

@router.get("/audio/{filename}")
async def download_generated_audio(filename: str):
    """Stream the generated Gujarati MP3 audio reply back to the browser or mobile app."""
    file_path = os.path.join("generated_audio", os.path.basename(filename))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(file_path, media_type="audio/mpeg", filename=filename)