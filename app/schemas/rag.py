from pydantic import BaseModel, Field

class IngestResponse(BaseModel):
    filename: str
    pages_processed: int
    chunks_indexed: int
    collection: str

class RAGQueryRequest(BaseModel):
    question: str = Field(..., min_length=2)
    initial_top_k: int = Field(default=15, ge=3, le=50, description="Candidates fetched from Qdrant")
    final_top_k: int = Field(default=3, ge=1, le=10, description="Top chunks kept after reranking")

class RetrievedChunk(BaseModel):
    source: str
    page: int
    rerank_score: float
    text_preview: str

class RAGQueryResponse(BaseModel):
    question: str
    answer: str
    sources: list[RetrievedChunk]