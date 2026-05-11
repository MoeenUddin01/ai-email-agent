"""AI Drafts router for reply generation."""

import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials

from src.db.supabase import SupabaseService, get_supabase_client
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
    email_id: str
    final_content: str
    draft_id: Optional[str] = None
    recipient: Optional[str] = None
    subject: Optional[str] = None


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
    payload = await verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return payload["id"]


@router.get("/{email_id}", response_model=Draft)
async def get_draft(email_id: str, request: Request):
    """Get AI draft for a specific email."""
    user_id = await get_current_user_id(request)
    supabase = SupabaseService(user_id)
    
    result = supabase._get_client().table("ai_drafts").select("*").eq("email_id", email_id).order("created_at", desc=True).limit(1).execute()
    
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


@router.post("/send")
async def send_draft(send_data: DraftSend, request: Request):
    """Send an approved draft via Gmail API."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    # Ensure user exists in public.users (FK target for emails)
    try:
        user_exists = supabase.table("users").select("id").eq("id", user_id).single().execute()
    except Exception:
        user_exists = None
    if not user_exists or not user_exists.data:
        try:
            supabase.table("users").insert({
                "id": user_id,
                "email": "",
                "google_id": user_id,
            }).execute()
        except Exception:
            pass

    # Resolve email_id: could be a UUID or a Gmail message ID
    email = None
    email_uuid = send_data.email_id
    is_uuid = False
    try:
        uuid.UUID(send_data.email_id)
        is_uuid = True
    except ValueError:
        pass

    if is_uuid:
        try:
            email_result = supabase.table("emails").select("*").eq("id", send_data.email_id).single().execute()
            email = email_result.data
        except Exception:
            pass
    else:
        try:
            email_result = supabase.table("emails").select("*").eq("gmail_id", send_data.email_id).single().execute()
            email = email_result.data
            if email:
                email_uuid = email["id"]
        except Exception:
            pass

    # If email was found but has empty sender/subject, update with provided data
    if email:
        updates = {}
        if not email.get("sender") and send_data.recipient:
            updates["sender"] = send_data.recipient
        if not email.get("subject") and send_data.subject:
            updates["subject"] = send_data.subject
        if updates:
            supabase.table("emails").update(updates).eq("id", email_uuid).execute()
            email.update(updates)

    # If email still not found, create a placeholder record
    if not email:
        new_uuid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        placeholder = {
            "id": new_uuid,
            "gmail_id": send_data.email_id,
            "user_id": user_id,
            "thread_id": send_data.email_id,
            "sender": send_data.recipient or "",
            "subject": send_data.subject or "",
            "body_text": "",
            "status": "processed",
            "received_at": now,
            "processed_at": now,
        }
        supabase.table("emails").insert(placeholder).execute()
        email = placeholder
        email_uuid = new_uuid
    
    # Determine if draft was modified
    was_modified = True
    if send_data.draft_id:
        try:
            draft_result = supabase.table("ai_drafts").select("draft_content").eq("id", send_data.draft_id).single().execute()
            if draft_result.data:
                was_modified = draft_result.data["draft_content"] != send_data.final_content
        except Exception:
            pass
    
    # Try to send via Gmail API
    gmail_message_id = None
    gmail_error = None
    try:
        creds_result = supabase.table("gmail_credentials").select("*").eq("user_id", user_id).single().execute()
        
        if creds_result.data and email and email.get("thread_id"):
            creds_data = creds_result.data
            credentials = Credentials(
                token=creds_data["access_token"],
                refresh_token=creds_data["refresh_token"],
                token_uri=creds_data["token_uri"],
                client_id=creds_data["client_id"],
                client_secret=creds_data["client_secret"],
                scopes=creds_data["scopes"]
            )
            
            gmail_service = GmailService(credentials)
            result = await gmail_service.send_reply(
                thread_id=email["thread_id"],
                to=email["sender"],
                subject=email.get("subject", "Re: Your Email"),
                body=send_data.final_content,
                original_message_id=email.get("gmail_id", ""),
            )
            gmail_message_id = result["gmail_message_id"]
    except Exception as e:
        gmail_error = str(e)
        print(f"Gmail send error (non-fatal): {gmail_error}")
    
    # Store sent email
    sent_email_data = {
        "email_id": email_uuid,
        "ai_draft_id": send_data.draft_id,
        "final_content": send_data.final_content,
        "was_modified": was_modified,
        "gmail_message_id": gmail_message_id,
    }
    
    result = supabase.table("sent_emails").insert(sent_email_data).execute()
    
    if email:
        supabase.table("emails").update({"status": "replied"}).eq("id", email_uuid).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to store sent email")
    
    return {
        "message": "Email sent successfully",
        "sent_email": result.data[0],
        "gmail_sent": gmail_message_id is not None,
        "gmail_error": gmail_error,
    }
