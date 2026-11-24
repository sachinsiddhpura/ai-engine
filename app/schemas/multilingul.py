from pydantic import BaseModel, Field

class GujaratiTextRAGRequest(BaseModel):
    gujarati_question: str = Field(
        ...,
        min_length=2,
        examples=["જો દર્દીનો eGFR 28.5 હોય તો શું મેટફોર્મિન આપી શકાય?"],
    )
    include_audio: bool = Field(default=True)


class MultilingualRAGResponse(BaseModel):
    original_gujarati_query: str
    translated_english_query: str
    english_rag_answer: str
    gujarati_final_answer: str
    citations: list[str]
    audio_output_path: str | None = None
