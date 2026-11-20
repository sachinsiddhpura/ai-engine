import asyncio
import json
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from app.services.rag_service import rag_service
from app.schemas.rag import RAGQueryRequest

judge_client = AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

class JudgeVerdict(BaseModel):
    faithfulness_score: float = Field(..., ge=0.0, le=1.0, description="1.0 if strictly grounded in context")
    relevancy_score: float = Field(..., ge=0.0, le=1.0, description="1.0 if directly answers the question")
    reasoning: str

GOLDEN_RAG_DATASET = [
    {
        "question": "What chunk size and overlap are used in the ingestion pipeline?",
        "expected_fact": "800-character chunks with 150-character overlap",
    },
    {
        "question": "Which port does the Qdrant vector database run on?",
        "expected_fact": "Port 6333",
    },
]

async def grade_rag_response(question: str, context: str, answer: str, expected: str) -> JudgeVerdict:
    prompt = f"""Grade this RAG system output strictly.
Question: {question}
Expected Fact: {expected}
Retrieved Context: {context}
Generated Answer: {answer}

Return JSON with faithfulness_score (0.0-1.0), relevancy_score (0.0-1.0), and reasoning."""

    resp = await judge_client.beta.chat.completions.parse(
        model="qwen2.5:7b",
        messages=[{"role": "user", "content": prompt}],
        response_format=JudgeVerdict,
        temperature=0.0,
    )
    return resp.choices[0].message.parsed

async def run_rag_evals():
    print("Running Automated RAG Evaluation Suite...\n")
    total_faith = 0.0
    total_rel = 0.0

    for item in GOLDEN_RAG_DATASET:
        rag_res = await rag_service.query(RAGQueryRequest(question=item["question"]))
        context_text = "\n".join([s.text_preview for s in rag_res.sources])
        verdict = await grade_rag_response(
            item["question"], context_text, rag_res.answer, item["expected_fact"]
        )
        total_faith += verdict.faithfulness_score
        total_rel += verdict.relevancy_score
        print(f"Q: {item['question']}")
        print(f"   Faithfulness: {verdict.faithfulness_score:.2f} | Relevancy: {verdict.relevancy_score:.2f}")
        print(f"   Judge Note:   {verdict.reasoning}\n")

    n = len(GOLDEN_RAG_DATASET)
    print(f"=== FINAL BENCHMARK: Avg Faithfulness = {total_faith/n:.2f} | Avg Relevancy = {total_rel/n:.2f} ===")

if __name__ == "__main__":
    asyncio.run(run_rag_evals())