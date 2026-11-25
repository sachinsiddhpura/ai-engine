import os
import re
import uuid
import torch
import edge_tts
from faster_whisper import WhisperModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from app.schemas.multilingul import MultilingualRAGResponse
from app.schemas.rag import RAGQueryRequest
from app.services.guadrails import validate_input_guardrails
# from app.services.rag_service import rag_service
from app.services.rag_service_parent import rag_service_parent

class VoiceTranslationPipelineService:
    def __init__(self):
        # 1. Detect whether an NVIDIA GPU (CUDA) is available; otherwise run on CPU
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # Use float16 precision on GPU for speed, or int8 quantization on CPU to save RAM
        compute_type = "float16" if self.device == "cuda" else "int8"

        # 2. Load Faster-Whisper model for Speech-to-Text (supports Gujarati language='gu')
        # 'small' (~480 MB) balances speed and accuracy; upgrade to 'medium' for noisy clinics
        self.stt_model = WhisperModel("small", device=self.device, compute_type=compute_type)

        # 3. Load Meta's NLLB-200 Neural Machine Translation model & tokenizer
        nllb_model_name = "facebook/nllb-200-distilled-600M"
        self.nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_model_name)
        self.nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_model_name).to(self.device)

        # 4. Ensure a local directory exists to store generated Gujarati audio replies
        self.audio_dir = "generated_audio"
        os.makedirs(self.audio_dir, exist_ok=True)

    def speech_to_gujarati_text(self, audio_file_path: str) -> str:
        """STAGE A: Transcribe spoken Gujarati audio (.wav/.mp3/.m4a) into Gujarati Unicode text."""
        # language="gu" forces Whisper to decode audio strictly into Gujarati script
        # beam_size=5 improves transcription accuracy on medical drug names
        segments, _info = self.stt_model.transcribe(audio_file_path, language="gu", beam_size=5)
        # Join all transcribed speech segments into a single clean sentence
        transcribed_text = " ".join(seg.text.strip() for seg in segments).strip()
        return transcribed_text

    def translate_text(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """STAGE B & D: Translate text between Gujarati ('guj_Gujr') and English ('eng_Latn')."""
        # Set the source language token ID on the NLLB tokenizer
        self.nllb_tokenizer.src_lang = src_lang
        # Convert input text into PyTorch token ID tensors and move to CPU/GPU
        encoded = self.nllb_tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(self.device)

        # Look up the special language token ID for the target language (e.g., 'eng_Latn' or 'guj_Gujr')
        forced_bos_id = self.nllb_tokenizer.convert_tokens_to_ids(tgt_lang)

        # Run neural sequence-to-sequence generation with beam search (num_beams=4)
        with torch.no_grad():
            generated_tokens = self.nllb_model.generate(
                **encoded,
                forced_bos_token_id=forced_bos_id,
                max_new_tokens=512,
                num_beams=4,
            )

        # Decode integer token IDs back into readable human text
        return self.nllb_tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0].strip()

    async def text_to_gujarati_speech(self, gujarati_text: str) -> str:
        """STAGE E: Convert final Gujarati text answer into a spoken MP3 audio file."""
        # Remove bracketed English PDF citations like [Manual.pdf, Page 2] before speaking aloud
        spoken_clean_text = re.sub(r"\[.*?\]", "", gujarati_text).strip()
        # Generate a unique filename so concurrent requests never overwrite each other
        output_file = os.path.join(self.audio_dir, f"reply_{uuid.uuid4().hex[:8]}.mp3")
        # Use Microsoft Neural Gujarati Female Voice ('gu-IN-DhwaniNeural')
        communicate = edge_tts.Communicate(spoken_clean_text, voice="gu-IN-DhwaniNeural")
        await communicate.save(output_file)
        return output_file

    async def run_gujarati_rag_pipeline(
        self, gujarati_query: str, include_audio: bool = True
    ) -> MultilingualRAGResponse:
        """Orchestrate the complete 5-stage Cross-Lingual & Voice RAG flow."""
        # Step 1: Run PHI/PII security guardrails on the incoming Gujarati query
        clean_gujarati = validate_input_guardrails(gujarati_query)

        # Step 2 (Stage B): Translate Gujarati ('guj_Gujr') -> English ('eng_Latn')
        english_query = self.translate_text(
            text=clean_gujarati,
            src_lang="guj_Gujr",
            tgt_lang="eng_Latn",
        )

        # Step 3 (Stage C): Execute Core English Hybrid RAG (Qdrant + Cross-Encoder + Qwen2.5)
        rag_result = await rag_service_parent.query(RAGQueryRequest(question=english_query))
        english_answer = rag_result.answer

        # Step 4 (Stage D): Translate English RAG answer -> Gujarati ('guj_Gujr')
        # Separate inline [Source, Page X] tags so NLLB-200 does not mangle filenames
        citations_found = re.findall(r"\[[^\]]+\]", english_answer)
        answer_without_tags = re.sub(r"\[[^\]]+\]", "", english_answer).strip()

        gujarati_translated = self.translate_text(
            text=answer_without_tags,
            src_lang="eng_Latn",
            tgt_lang="guj_Gujr",
        )

        # Re-append exact English PDF page citations at the end for clinical traceability
        unique_citations = list(dict.fromkeys(citations_found))
        if unique_citations:
            gujarati_final = f"{gujarati_translated} {' '.join(unique_citations)}"
        else:
            gujarati_final = gujarati_translated

        # Step 5 (Stage E): Synthesize Gujarati voice audio if requested
        audio_path = None
        if include_audio:
            audio_path = await self.text_to_gujarati_speech(gujarati_final)

        return MultilingualRAGResponse(
            original_gujarati_query=clean_gujarati,
            translated_english_query=english_query,
            english_rag_answer=english_answer,
            gujarati_final_answer=gujarati_final,
            citations=unique_citations,
            audio_output_path=audio_path,
        )

# Instantiate singleton service
voice_translation_service = VoiceTranslationPipelineService()