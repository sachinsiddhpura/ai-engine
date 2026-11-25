from pydantic import BaseModel, Field

class UniversalTextRAGRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=2,
        examples=["જો દર્દીનો eGFR 28.5 હોય તો શું મેટફોર્મિન આપી શકાય?"],
        description="User question in any supported language (Gujarati, Hindi, Marathi, Tamil, English, etc.)",
    )
    include_audio: bool = Field(
        default=True,
        description="Whether to synthesize a spoken MP3 response in the detected language",
    )

class UniversalRAGResponse(BaseModel):
    detected_language: str = Field(..., examples=["gu", "hi", "en"])
    original_query: str
    english_query: str
    english_answer: str
    localized_answer: str
    citations: list[str]
    audio_output_path: str | None = None