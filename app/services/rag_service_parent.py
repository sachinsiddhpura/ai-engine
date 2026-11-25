import hashlib
import math
import re
import uuid
from collections import Counter

import fitz  # PyMuPDF for PDF text extraction
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient, models
from sentence_transformers import CrossEncoder

from app.config import settings
from app.schemas.rag import (
    CitationSource,
    IngestResponse,
    RAGQueryRequest,
    RAGQueryResponse,
)
from app.services.guadrails import validate_input_guardrails

def text_to_sparse_vector(text: str, vocab_size: int = 1_000_000) -> models.SparseVector:
    """Convert raw text into a Qdrant SparseVector (BM25/IDF-ready token indices & weights)."""
    tokens = re.findall(r"[a-zA-Z0-9_.-]+", text.lower())
    if not tokens:
        return models.SparseVector(indices=[], values=[])

    counts = Counter(tokens)
    index_weights: dict[int, float] = {}

    for token, tf in counts.items():
        idx = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % vocab_size
        weight = 1.0 + math.log(tf)
        index_weights[idx] = index_weights.get(idx, 0.0) + weight

    sorted_items = sorted(index_weights.items())
    return models.SparseVector(
        indices=[idx for idx, _ in sorted_items],
        values=[val for _, val in sorted_items],
    )


class HybridParentChildRAGService:
    def __init__(self):
        self.oai = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key=settings.ollama_api_key,
        )
        self.qdrant = AsyncQdrantClient(url=settings.qdrant_url)
        self.reranker = CrossEncoder(settings.reranker_model)
        self.collection_name = f"{settings.qdrant_collection}_hybrid"

    async def _ensure_hybrid_collection(self, dense_size: int = 768):
        """Create a Qdrant collection with BOTH Dense (768d) and Sparse (IDF) vector spaces."""
        exists = await self.qdrant.collection_exists(self.collection_name)
        if not exists:
            await self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config={
                    "dense": models.VectorParams(
                        size=dense_size,
                        distance=models.Distance.COSINE,
                    )
                },
                sparse_vectors_config={
                    "sparse": models.SparseVectorParams(
                        modifier=models.Modifier.IDF,
                    )
                },
            )

    def _split_windows(self, text: str, size: int, overlap: int) -> list[str]:
        chunks: list[str] = []
        start = 0
        while start < len(text):
            piece = text[start : start + size].strip()
            if piece:
                chunks.append(piece)
            start += size - overlap
        return chunks

    async def ingest_pdf(self, filename: str, file_bytes: bytes) -> IngestResponse:
        """Ingest PDF with Parent (1,800 chars) -> Child (400 chars) hierarchy + Dual Vectors."""
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        points: list[models.PointStruct] = []

        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page_text = doc[page_idx].get_text("text")
            parent_chunks = self._split_windows(page_text, size=1800, overlap=250)

            for parent_text in parent_chunks:
                parent_id = str(uuid.uuid4())
                child_chunks = self._split_windows(parent_text, size=400, overlap=80)

                for child_text in child_chunks:
                    emb_resp = await self.oai.embeddings.create(
                        model=settings.embed_model,
                        input=child_text,
                    )
                    dense_vec = emb_resp.data[0].embedding
                    await self._ensure_hybrid_collection(len(dense_vec))

                    points.append(
                        models.PointStruct(
                            id=str(uuid.uuid4()),
                            vector={
                                "dense": dense_vec,
                                "sparse": text_to_sparse_vector(child_text),
                            },
                            payload={
                                "source": filename,
                                "page": page_num,
                                "parent_id": parent_id,
                                "child_text": child_text,
                                "parent_text": parent_text,
                            },
                        )
                    )

        if points:
            await self.qdrant.upsert(collection_name=self.collection_name, points=points)

        return IngestResponse(
            filename=filename,
            pages_processed=len(doc),
            chunks_indexed=len(points),
            collection=self.collection_name,
        )

    async def query(self, req: RAGQueryRequest) -> RAGQueryResponse:
        """3-Stage Retrieval: Hybrid Prefetch -> RRF Fusion -> Cross-Encoder -> Parent Expansion."""
        clean_q = validate_input_guardrails(req.question)
        q_dense = (
            await self.oai.embeddings.create(model=settings.embed_model, input=clean_q)
        ).data[0].embedding
        q_sparse = text_to_sparse_vector(clean_q)

        hybrid_hits = await self.qdrant.query_points(
            collection_name=self.collection_name,
            prefetch=[
                models.Prefetch(query=q_dense, using="dense", limit=req.top_k_retrieval),
                models.Prefetch(query=q_sparse, using="sparse", limit=req.top_k_retrieval),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            limit=req.top_k_retrieval,
        )

        candidates = hybrid_hits.points
        if not candidates:
            return RAGQueryResponse(
                question=clean_q,
                answer="No clinical formulary documents are indexed yet. Please upload a PDF first.",
                sources=[],
            )

        pairs = [(clean_q, hit.payload["child_text"]) for hit in candidates]
        scores = self.reranker.predict(pairs)
        ranked_children = sorted(zip(candidates, scores), key=lambda x: float(x[1]), reverse=True)

        seen_parents: set[str] = set()
        sources: list[CitationSource] = []
        context_blocks: list[str] = []

        for hit, score in ranked_children:
            p_id = hit.payload["parent_id"]
            if p_id in seen_parents:
                continue
            seen_parents.add(p_id)

            src = hit.payload["source"]
            pg = hit.payload["page"]
            parent_txt = hit.payload["parent_text"]

            sources.append(
                CitationSource(
                    source=src,
                    page=pg,
                    rerank_score=round(float(score), 4),
                    text_preview=hit.payload["child_text"][:200] + "...",
                )
            )
            context_blocks.append(f"[{src}, Page {pg}]:\n{parent_txt}")
            if len(sources) >= req.final_top_k:
                break

        context_str = "\n\n---\n\n".join(context_blocks)
        system_prompt = (
            "You are MediVault Clinical Protocol Assistant. Answer ONLY using the provided formulary sections. "
            "Cite every clinical rule inline using [Source, Page X]. "
            "If the answer is not in the excerpts, state: 'Not found in indexed hospital formulary.'"
        )

        completion = await self.oai.chat.completions.create(
            model=settings.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Excerpts:\n{context_str}\n\nQuestion: {clean_q}"},
            ],
            temperature=0.0,
        )

        return RAGQueryResponse(
            question=clean_q,
            answer=completion.choices[0].message.content or "",
            sources=sources,
        )

rag_service_parent = HybridParentChildRAGService()