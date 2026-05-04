"""Email router for Gmail integration."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from src.db.supabase import SupabaseService
from src.email.gmail import GmailService
from src.rag.service import RAGService
from src.api.routers.auth import verify_token
from src.db.supabase import get_supabase_client

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
    """Extract user ID from JWT token."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    payload = await verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return payload["id"]


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
    
    try:
        # Check if user has Gmail credentials stored
        supabase = get_supabase_client()
        
        try:
            credentials_result = supabase.table("user_credentials").select("*").eq("user_id", user_id).eq("provider", "gmail").execute()
            
            if not credentials_result.data:
                return {
                    "message": "Gmail not connected",
                    "detail": "Please connect your Gmail account first",
                    "user_id": user_id,
                    "status": "gmail_not_connected"
                }
        except Exception as table_error:
            # Table doesn't exist or other database issue
            print(f"Database table error: {table_error}")
            return {
                "message": "Gmail integration not set up",
                "detail": "Gmail integration is not yet configured. Please contact support.",
                "user_id": user_id,
                "status": "gmail_not_configured"
            }
        
        # Get Gmail credentials
        credentials_data = credentials_result.data[0]
        
        # Create Gmail service with stored credentials
        from google.oauth2.credentials import Credentials
        gmail_credentials = Credentials(
            token=credentials_data.get('access_token'),
            refresh_token=credentials_data.get('refresh_token'),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GMAIL_CLIENT_ID,
            client_secret=settings.GMAIL_CLIENT_SECRET,
            scopes=GmailService.SCOPES
        )
        
        gmail_service = GmailService(gmail_credentials)
        
        # Fetch emails from Gmail
        emails = await gmail_service.fetch_emails(max_results=50)
        
        # Store emails in database
        supabase_service = SupabaseService(user_id)
        stored_emails = []
        
        for email_data in emails:
            try:
                # Check if email already exists
                existing = supabase.table("emails").select("*").eq("gmail_id", email_data['id']).eq("user_id", user_id).execute()
                
                if not existing.data:
                    # Store new email
                    email_record = {
                        "gmail_id": email_data['id'],
                        "thread_id": email_data['thread_id'],
                        "user_id": user_id,
                        "sender": email_data['sender'],
                        "subject": email_data['subject'],
                        "body_text": email_data['body_text'],
                        "received_at": email_data['received_at'],
                        "status": "unread"
                    }
                    
                    result = supabase.table("emails").insert(email_record).execute()
                    if result.data:
                        stored_emails.append(result.data[0])
                else:
                    stored_emails.append(existing.data[0])
                    
            except Exception as e:
                print(f"Error storing email {email_data.get('id', 'unknown')}: {e}")
                continue
        
        return {
            "message": f"Sync completed successfully",
            "user_id": user_id,
            "emails_synced": len(stored_emails),
            "new_emails": len([e for e in stored_emails if e.get('status') == 'unread']),
            "status": "success"
        }
        
    except Exception as e:
        print(f"Gmail sync error: {e}")
        return {
            "message": "Sync failed",
            "detail": str(e),
            "user_id": user_id,
            "status": "error"
        }


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
