"""Knowledge base router for vector database management."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from typing import List

from src.db.supabase import get_supabase_client
from src.rag.service import RAGService
from src.api.routers.auth import verify_token

router = APIRouter()


class KnowledgeDocument(BaseModel):
    id: str
    content: str
    metadata: dict
    created_at: str


class SearchQuery(BaseModel):
    query: str
    limit: int = 5


class SearchResult(BaseModel):
    id: str
    content: str
    metadata: dict
    similarity: float


async def get_current_user_id(request: Request) -> str:
    """Extract and verify user from JWT token."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return payload["sub"]


@router.post("/ingest")
async def ingest_csv(file: UploadFile = File(...), request: Request):
    """Ingest a CSV file into the vector database."""
    user_id = await get_current_user_id(request)
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    import tempfile
    import os
    
    try:
        with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.csv') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        rag_service = RAGService()
        count = await rag_service.ingest_csv(tmp_path)
        
        os.unlink(tmp_path)
        
        return {
            "message": "CSV ingested successfully",
            "filename": file.filename,
            "documents_ingested": count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest CSV: {str(e)}")


@router.post("/search", response_model=List[SearchResult])
async def search_knowledge(query: SearchQuery, request: Request):
    """Search the knowledge base using vector similarity."""
    user_id = await get_current_user_id(request)
    
    rag_service = RAGService()
    results = await rag_service.search(query.query, limit=query.limit)
    
    return results


@router.get("/documents", response_model=List[KnowledgeDocument])
async def list_documents(request: Request, limit: int = 50, offset: int = 0):
    """List all knowledge documents."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    result = supabase.table("knowledge_vectors").select("*").limit(limit).offset(offset).execute()
    
    return [KnowledgeDocument(**doc) for doc in result.data]


@router.delete("/{document_id}")
async def delete_document(document_id: str, request: Request):
    """Delete a knowledge document."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    result = supabase.table("knowledge_vectors").delete().eq("id", document_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {"message": "Document deleted", "id": document_id}
