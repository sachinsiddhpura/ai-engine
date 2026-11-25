import os
import re
import uuid
import torch
import edge_tts
from faster_whisper import WhisperModel
from langdetect import detect
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from app.schemas.rag import RAGQueryRequest
from app.services.guadrails import validate_input_guardrails
from app.services.rag_service_parent import rag_service_parent

LANGUAGE_REGISTRY: dict[str, tuple[str, str]] = {
    "en": ("eng_Latn", "en-IN-NeerjaNeural"),
    "gu": ("guj_Gujr", "gu-IN-DhwaniNeural"),
    "hi": ("hin_Deva", "hi-IN-SwaraNeural"),
    "mr": ("mar_Deva", "mr-IN-AarohiNeural"),
    "ta": ("tam_Taml", "ta-IN-PallaviNeural"),
    "te": ("tel_Telu", "tel-IN-ShrutiNeural"),
    "bn": ("ben_Beng", "bn-IN-TanishaaNeural"),
    "kn": ("kan_Knda", "kn-IN-SapnaNeural"),
    "ml": ("mal_Mlym", "ml-IN-SobhanaNeural"),
    "pa": ("pan_Guru", "pa-IN-GurpreetNeural"),
    "es": ("spa_Latn", "es-ES-ElviraNeural"),
    "fr": ("fra_Latn", "fr-FR-DeniseNeural"),
    "ar": ("arb_Arab", "ar-SA-ZariyahNeural"),
}

class UniversalMultilingualRAGService:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if self.device == "cuda" else "int8"

        self.stt_model = WhisperModel("small", device=self.device, compute_type=compute_type)
        nllb_name = "facebook/nllb-200-distilled-600M"
        self.nllb_tokenizer = AutoTokenizer.from_pretrained(nllb_name)
        self.nllb_model = AutoModelForSeq2SeqLM.from_pretrained(nllb_name).to(self.device)

        self.audio_dir = "generated_audio"
        os.makedirs(self.audio_dir, exist_ok=True)

    def detect_text_language(self, text: str) -> str:
        try:
            iso_code = detect(text)
            return iso_code if iso_code in LANGUAGE_REGISTRY else "en"
        except Exception:
            return "en"

    def speech_to_text_auto(self, audio_path: str) -> tuple[str, str]:
        segments, info = self.stt_model.transcribe(audio_path, language=None, beam_size=5)
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        detected_iso = info.language if info.language in LANGUAGE_REGISTRY else "en"
        return transcript, detected_iso

    def translate_nllb(self, text: str, src_nllb: str, tgt_nllb: str) -> str:
        if src_nllb == tgt_nllb:
            return text
        self.nllb_tokenizer.src_lang = src_nllb
        encoded = self.nllb_tokenizer(text, return_tensors="pt", truncation=True, max_length=512).to(self.device)
        forced_bos_id = self.nllb_tokenizer.convert_tokens_to_ids(tgt_nllb)
        with torch.no_grad():
            generated = self.nllb_model.generate(
                **encoded,
                forced_bos_token_id=forced_bos_id,
                max_new_tokens=512,
                num_beams=4,
            )
        return self.nllb_tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()

    async def text_to_speech_dynamic(self, text: str, tts_voice: str) -> str:
        clean_spoken = re.sub(r"\[.*?\]", "", text).strip()
        out_path = os.path.join(self.audio_dir, f"reply_{uuid.uuid4().hex[:8]}.mp3")
        communicate = edge_tts.Communicate(clean_spoken, voice=tts_voice)
        await communicate.save(out_path)
        return out_path

    async def process_any_language(
        self,
        raw_text: str,
        detected_iso: str | None = None,
        include_audio: bool = True,
    ) -> dict:
        clean_input = validate_input_guardrails(raw_text)
        lang_iso = detected_iso or self.detect_text_language(clean_input)
        nllb_code, tts_voice = LANGUAGE_REGISTRY.get(lang_iso, ("eng_Latn", "en-IN-NeerjaNeural"))

        english_query = self.translate_nllb(clean_input, src_nllb=nllb_code, tgt_nllb="eng_Latn")
        rag_res = await rag_service_parent.query(RAGQueryRequest(question=english_query))
        english_answer = rag_res.answer

        citations = list(dict.fromkeys(re.findall(r"\[[^\]]+\]", english_answer)))
        prose_only = re.sub(r"\[[^\]]+\]", "", english_answer).strip()

        localized_prose = self.translate_nllb(prose_only, src_nllb="eng_Latn", tgt_nllb=nllb_code)
        final_answer = f"{localized_prose} {' '.join(citations)}".strip()
        audio_path = await self.text_to_speech_dynamic(final_answer, tts_voice) if include_audio else None

        return {
            "detected_language": lang_iso,
            "original_query": clean_input,
            "english_query": english_query,
            "english_answer": english_answer,
            "localized_answer": final_answer,
            "citations": citations,
            "audio_output_path": audio_path,
        }

universal_rag_service = UniversalMultilingualRAGService()