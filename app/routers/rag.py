from fastapi import APIRouter, File, HTTPException, UploadFile
from app.schemas.rag import IngestResponse, RAGQueryRequest, RAGQueryResponse
from app.services.rag_service import rag_service

router = APIRouter(prefix="/api/v1/rag", tags=["RAG Pipeline"])


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        file_bytes = await file.read()
        return await rag_service.ingest_pdf(file.filename, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query", response_model=RAGQueryResponse)
async def query_documents(request: RAGQueryRequest):
    try:
        return await rag_service.query(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))