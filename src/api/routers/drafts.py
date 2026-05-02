"""AI Drafts router for reply generation."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from src.db.supabase import get_supabase_client
from src.rag.service import RAGService
from src.email.gmail import GmailService
from src.api.routers.auth import verify_token

router = APIRouter()


class Draft(BaseModel):
    id: str
    email_id: str
    draft_content: str
    model_used: str
    retrieved_context: dict
    created_at: datetime


class DraftCreate(BaseModel):
    email_id: str


class DraftSend(BaseModel):
    draft_id: str
    final_content: str


class SentEmail(BaseModel):
    id: str
    email_id: str
    ai_draft_id: str
    final_content: str
    was_modified: bool
    sent_at: datetime


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


@router.get("/{email_id}", response_model=Draft)
async def get_draft(email_id: str, request: Request):
    """Get AI draft for a specific email."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    result = supabase.table("ai_drafts").select("*").eq("email_id", email_id).order("created_at", desc=True).limit(1).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    return Draft(**result.data[0])


@router.post("/{email_id}/regenerate")
async def regenerate_draft(email_id: str, request: Request):
    """Regenerate AI draft for an email."""
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
        
        result = supabase.table("ai_drafts").insert(draft_data).execute()
        
        return {
            "message": "Draft regenerated successfully",
            "draft": Draft(**result.data[0]) if result.data else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate draft: {str(e)}")


@router.post("/send", response_model=SentEmail)
async def send_draft(send_data: DraftSend, request: Request):
    """Send an approved draft via Gmail API."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    email_result = supabase.table("emails").select("*").eq("id", send_data.email_id).eq("user_id", user_id).single().execute()
    if not email_result.data:
        raise HTTPException(status_code=404, detail="Email not found")
    
    email = email_result.data
    
    draft_result = supabase.table("ai_drafts").select("draft_content").eq("id", send_data.draft_id).single().execute()
    
    was_modified = True
    if draft_result.data:
        was_modified = draft_result.data["draft_content"] != send_data.final_content
    
    sent_email_data = {
        "email_id": send_data.email_id,
        "ai_draft_id": send_data.draft_id,
        "final_content": send_data.final_content,
        "was_modified": was_modified,
    }
    
    result = supabase.table("sent_emails").insert(sent_email_data).execute()
    supabase.table("emails").update({"status": "replied"}).eq("id", send_data.email_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to store sent email")
    
    return SentEmail(**result.data[0])
