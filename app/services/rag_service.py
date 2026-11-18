import uuid
import fitz  # PyMuPDF
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from sentence_transformers import CrossEncoder
from app.config import settings
from app.schemas.rag import IngestResponse, RAGQueryRequest, RAGQueryResponse, RetrievedChunk


class RAGService:
    def __init__(self):
        self.llm_client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key=settings.ollama_api_key,
        )
        self.qdrant = AsyncQdrantClient(url=settings.qdrant_url)
        # Downloads a lightweight (~80MB) local Cross-Encoder on first run
        self.reranker = CrossEncoder(settings.reranker_model)
        self.vector_size = 768  # nomic-embed-text output dimension

    async def _ensure_collection(self):
        """Create the Qdrant collection if it does not already exist."""
        collections = await self.qdrant.get_collections()
        existing = [c.name for c in collections.collections]
        if settings.qdrant_collection not in existing:
            await self.qdrant.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE,
                ),
            )

    def _chunk_text(self, text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
        """Split text into overlapping windows while preserving word boundaries."""
        chunks: list[str] = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = min(start + chunk_size, text_len)
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end == text_len:
                break
            start += chunk_size - overlap
        return chunks

    async def _get_embedding(self, text: str) -> list[float]:
        """Generate dense vector embedding via local Ollama nomic-embed-text."""
        response = await self.llm_client.embeddings.create(
            model=settings.embed_model,
            input=text,
        )
        return response.data[0].embedding

    # ---------------------------------------------------------
    # WRITE PATH: PDF -> Chunks -> Embeddings -> Qdrant
    # ---------------------------------------------------------
    async def ingest_pdf(self, filename: str, file_bytes: bytes) -> IngestResponse:
        await self._ensure_collection()

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        points: list[PointStruct] = []

        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page_text = doc[page_idx].get_text("text")
            chunks = self._chunk_text(page_text)

            for chunk in chunks:
                vector = await self._get_embedding(chunk)
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload={
                            "source": filename,
                            "page": page_num,
                            "text": chunk,
                        },
                    )
                )

        if points:
            await self.qdrant.upsert(
                collection_name=settings.qdrant_collection,
                points=points,
            )

        return IngestResponse(
            filename=filename,
            pages_processed=len(doc),
            chunks_indexed=len(points),
            collection=settings.qdrant_collection,
        )

    # ---------------------------------------------------------
    # READ PATH: Embed Query -> Qdrant Top-K -> Rerank -> LLM
    # ---------------------------------------------------------
    async def query(self, req: RAGQueryRequest) -> RAGQueryResponse:
        await self._ensure_collection()

        # 1. Embed the user's question
        query_vector = await self._get_embedding(req.question)

        # 2. Broad recall from Qdrant
        search_results = await self.qdrant.query_points(
            collection_name=settings.qdrant_collection,
            query=query_vector,
            limit=req.initial_top_k,
        )
        hits = search_results.points

        if not hits:
            return RAGQueryResponse(
                question=req.question,
                answer="No documents have been indexed yet. Please upload a PDF first.",
                sources=[],
            )

        # 3. Cross-Encoder Reranking: score (question, candidate_text) pairs directly
        pairs = [(req.question, hit.payload["text"]) for hit in hits]
        scores = self.reranker.predict(pairs)

        scored_hits = sorted(
            zip(hits, scores),
            key=lambda item: float(item[1]),
            reverse=True,
        )[: req.final_top_k]

        # 4. Build grounded context block with citations
        context_blocks: list[str] = []
        retrieved_sources: list[RetrievedChunk] = []

        for hit, score in scored_hits:
            src = hit.payload["source"]
            page = hit.payload["page"]
            txt = hit.payload["text"]
            context_blocks.append(f"\n{txt}")
            retrieved_sources.append(
                RetrievedChunk(
                    source=src,
                    page=page,
                    rerank_score=round(float(score), 4),
                    text_preview=txt[:200] + "..." if len(txt) > 200 else txt,
                )
            )

        context_str = "\n\n---\n\n".join(context_blocks)

        # 5. Generate answer strictly grounded in retrieved chunks
        completion = await self.llm_client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise technical assistant. Answer the user's question "
                        "using ONLY the provided context below. Cite sources inline as "
                        "[Source, Page X]. If the answer is not contained in the context, "
                        "say 'I cannot find this information in the uploaded documents.'"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context:\n{context_str}\n\nQuestion: {req.question}",
                },
            ],
            temperature=0.0,
            extra_body={"options": {"num_ctx": settings.default_num_ctx}},
        )

        return RAGQueryResponse(
            question=req.question,
            answer=completion.choices[0].message.content or "",
            sources=retrieved_sources,
        )


rag_service = RAGService()