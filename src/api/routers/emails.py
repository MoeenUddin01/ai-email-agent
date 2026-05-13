"""Email router for Gmail integration."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from google.oauth2.credentials import Credentials

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
    print(f"[Auth] authorization header present: {bool(auth_header)}, value prefix: {str(auth_header)[:30] if auth_header else 'NONE'}")
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



MOCK_EMAILS = [
    {
        "id": "mock-1",
        "gmail_id": "mock-gmail-1",
        "thread_id": "mock-thread-1",
        "sender": "prospective.student@gmail.com",
        "subject": "Question about Data Science course",
        "body_text": "Hi, I'm interested in your Data Science program. I have a background in Python and statistics, and I'd like to know more about the curriculum, duration, and prerequisites. Also, are there any upcoming intake dates? Please let me know the fee structure as well.",
        "received_at": "2026-05-11T10:30:00Z",
        "status": "unread"
    },
    {
        "id": "mock-2",
        "gmail_id": "mock-gmail-2",
        "thread_id": "mock-thread-2",
        "sender": "sarah.manager@company.com",
        "subject": "Team training on AI fundamentals",
        "body_text": "Hello, our team of 12 developers needs training on AI fundamentals. We're looking for a program that covers machine learning basics, practical Python exercises, and real-world applications. Can you recommend a course and let us know about group pricing? We'd like to start next month.",
        "received_at": "2026-05-10T15:45:00Z",
        "status": "unread"
    },
    {
        "id": "mock-3",
        "gmail_id": "mock-gmail-3",
        "thread_id": "mock-thread-3",
        "sender": "academic@university.edu",
        "subject": "Curriculum partnership inquiry",
        "body_text": "Dear Advisor, Our university is looking to integrate your data science curriculum into our continuing education program. We'd like to discuss licensing options, customization possibilities, and accreditation details. Please let me know who I can speak with about this partnership opportunity.",
        "received_at": "2026-05-09T09:15:00Z",
        "status": "unread"
    },
]


@router.post("/sync")
async def sync_emails(request: Request):
    """Fetch emails from Gmail — falls back to mock emails for testing."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()

    try:
        credentials_result = supabase.table("gmail_credentials").select("*").eq("user_id", user_id).single().execute()

        if credentials_result.data:
            creds_data = credentials_result.data
            credentials = Credentials(
                token=creds_data["access_token"],
                refresh_token=creds_data["refresh_token"],
                token_uri=creds_data["token_uri"],
                client_id=creds_data["client_id"],
                client_secret=creds_data["client_secret"],
                scopes=creds_data["scopes"]
            )

            gmail_service = GmailService(credentials)
            emails_data = await gmail_service.fetch_emails(max_results=50)

            formatted_emails = []
            for i, email_data in enumerate(emails_data):
                formatted_emails.append({
                    "id": f"gmail-{i}",
                    "gmail_id": email_data["gmail_id"],
                    "thread_id": email_data["thread_id"],
                    "sender": email_data["sender"],
                    "subject": email_data["subject"],
                    "body_text": email_data["body_text"],
                    "received_at": email_data["received_at"],
                    "status": "unread"
                })

            if formatted_emails:
                return {
                    "message": "Emails fetched successfully from Gmail",
                    "user_id": user_id,
                    "emails": formatted_emails,
                    "total": len(formatted_emails),
                    "status": "success"
                }
    except Exception as e:
        print(f"Gmail sync error (falling back to mocks): {e}")

    return {
        "message": "Using test emails (Gmail unavailable)",
        "user_id": user_id,
        "emails": MOCK_EMAILS,
        "total": len(MOCK_EMAILS),
        "status": "success"
    }


class DirectProcessRequest(BaseModel):
    sender: str
    subject: str
    body_text: str


@router.post("/process-direct")
async def process_email_direct(body: DirectProcessRequest, request: Request):
    """Generate an AI draft for an email provided directly in the request body."""
    await get_current_user_id(request)  # ensure authenticated
    rag_service = RAGService()
    try:
        draft_result = await rag_service.generate_reply(
            email_content=body.body_text,
            sender=body.sender,
            subject=body.subject,
        )
        return {
            "draft_content": draft_result["draft_content"],
            "model_used": draft_result["model_used"],
            "retrieved_context": draft_result.get("retrieved_context"),
            "token_info": draft_result.get("token_info"),
        }
    except Exception as e:
        print(f"Direct process error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate draft: {str(e)}")


@router.post("/{email_id}/process")
async def process_email(email_id: str, request: Request):
    """Trigger AI draft generation for an email using RAG."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    # Check if it's a mock email (starts with "mock-")
    if email_id.startswith("mock-"):
        # Use predefined mock email data
        mock_emails = {
            "mock-1": {
                "id": "mock-1",
                "gmail_id": "gmail-123",
                "thread_id": "thread-123",
                "sender": "john.doe@example.com",
                "subject": "Project Update - Q4 Review",
                "body_text": "Hi team, I wanted to share the latest project updates for our Q4 review. We've made significant progress on the AI email agent and would love to get your feedback on the current implementation.",
                "received_at": "2024-01-15T10:30:00Z",
                "status": "unread"
            },
            "mock-2": {
                "id": "mock-2", 
                "gmail_id": "gmail-456",
                "thread_id": "thread-456",
                "sender": "sarah@company.com",
                "subject": "Meeting Request - AI Strategy Discussion",
                "body_text": "Hi, I'd like to schedule a meeting to discuss our AI strategy for the upcoming quarter. The email automation project looks promising and I'd like to understand how we can leverage it better.",
                "received_at": "2024-01-14T15:45:00Z",
                "status": "unread"
            }
        }
        
        email = mock_emails.get(email_id)
        if not email:
            raise HTTPException(status_code=404, detail="Mock email not found")
    else:
        # Try to find email in database
        try:
            email_result = supabase.table("emails").select("*").eq("id", email_id).eq("user_id", user_id).single().execute()
            if not email_result.data:
                raise HTTPException(status_code=404, detail="Email not found")
            email = email_result.data
        except Exception:
            raise HTTPException(status_code=404, detail="Email not found")
    
    rag_service = RAGService()
    try:
        print(f"DEBUG: Processing email {email_id} from {email['sender']}")
        draft_result = await rag_service.generate_reply(
            email_content=email["body_text"],
            sender=email["sender"],
            subject=email["subject"]
        )
        print(f"DEBUG: AI generation completed successfully")
        
        # Only persist to database for real emails (not mock emails)
        if not email_id.startswith("mock-"):
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
            "draft_content": draft_result["draft_content"],
            "model_used": draft_result["model_used"],
            "draft_preview": draft_result["draft_content"][:200] + "..." if len(draft_result["draft_content"]) > 200 else draft_result["draft_content"],
            "token_info": draft_result.get("token_info"),
        }
        
    except Exception as e:
        print(f"ERROR generating draft: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate draft: {str(e)}")
