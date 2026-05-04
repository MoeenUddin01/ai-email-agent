"""Email router for Gmail integration."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from src.db.supabase import SupabaseService
from src.email.gmail import GmailService
from src.rag.service import RAGService
from src.api.routers.auth import verify_token

router = APIRouter()


class Email(BaseModel):
    id: str
    gmail_id: str
    thread_id: str
    sender: str
    subject: str
    body_text: str
    received_at: datetime
    status: str


class EmailListResponse(BaseModel):
    emails: List[Email]
    total: int


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


@router.get("/", response_model=EmailListResponse)
async def list_emails(
    request: Request,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List emails for the authenticated user."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    query = supabase.table("emails").select("*").eq("user_id", user_id)
    
    if status:
        query = query.eq("status", status)
    
    query = query.order("received_at", desc=True).limit(limit).offset(offset)
    result = query.execute()
    
    emails = [Email(**email) for email in result.data]
    return EmailListResponse(emails=emails, total=len(emails))


@router.get("/{email_id}", response_model=Email)
async def get_email(email_id: str, request: Request):
    """Get a specific email by ID."""
    user_id = await get_current_user_id(request)
    supabase = SupabaseService(user_id)
    
    result = supabase._get_client().table("emails").select("*").eq("id", email_id).eq("user_id", user_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Email not found")
    
    return Email(**result.data)


@router.post("/sync")
async def sync_emails(request: Request):
    """Sync emails from Gmail API."""
    user_id = await get_current_user_id(request)
    
    # TODO: Implement Gmail sync logic
    return {"message": "Sync initiated", "user_id": user_id}


@router.post("/{email_id}/process")
async def process_email(email_id: str, request: Request):
    """Trigger AI draft generation for an email using RAG."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    email_result = supabase.table("emails").select("*").eq("id", email_id).eq("user_id", user_id).single().execute()
    if not email_result.data:
        raise HTTPException(status_code=404, detail="Email not found")
    
    email = email_result.data
    
    rag_service = RAGService()
    try:
        draft_result = await rag_service.generate_reply(
            email_content=email["body_text"],
            sender=email["sender"],
            subject=email["subject"]
        )
        
        draft_data = {
            "email_id": email_id,
            "draft_content": draft_result["draft_content"],
            "model_used": draft_result["model_used"],
            "retrieved_context": draft_result["retrieved_context"],
        }
        
        supabase.table("ai_drafts").insert(draft_data).execute()
        supabase.table("emails").update({"status": "processed", "processed_at": "now()"}).eq("id", email_id).execute()
        
        return {
            "message": "AI draft generated successfully",
            "email_id": email_id,
            "draft_preview": draft_result["draft_content"][:200] + "..." if len(draft_result["draft_content"]) > 200 else draft_result["draft_content"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate draft: {str(e)}")
