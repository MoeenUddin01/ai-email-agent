"""Feedback router for rating AI replies."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from src.db.supabase import get_supabase_client
from src.api.routers.auth import verify_token

router = APIRouter()


class FeedbackCreate(BaseModel):
    sent_email_id: str
    star_rating: int
    text_feedback: Optional[str] = None


class Feedback(BaseModel):
    id: str
    sent_email_id: str
    star_rating: int
    text_feedback: Optional[str]
    created_at: datetime


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


@router.post("/", response_model=Feedback)
async def submit_feedback(feedback: FeedbackCreate, request: Request):
    """Submit feedback for a sent email reply."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    if not 1 <= feedback.star_rating <= 5:
        raise HTTPException(status_code=400, detail="Star rating must be between 1 and 5")
    
    sent_result = supabase.table("sent_emails").select("id").eq("id", feedback.sent_email_id).execute()
    if not sent_result.data:
        raise HTTPException(status_code=404, detail="Sent email not found")
    
    feedback_data = {
        "sent_email_id": feedback.sent_email_id,
        "star_rating": feedback.star_rating,
        "text_feedback": feedback.text_feedback,
    }
    
    result = supabase.table("feedback").insert(feedback_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to store feedback")
    
    return Feedback(**result.data[0])


@router.get("/stats")
async def get_feedback_stats(request: Request):
    """Get feedback statistics for the user."""
    user_id = await get_current_user_id(request)
    supabase = get_supabase_client()
    
    result = supabase.rpc(
        "get_user_feedback_stats",
        {"user_id": user_id}
    ).execute()
    
    if result.data:
        stats = result.data[0]
        return {
            "total_feedback": stats.get("total_count", 0),
            "average_rating": round(stats.get("average_rating", 0), 2),
            "ratings_distribution": stats.get("distribution", {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}),
        }
    
    return {
        "total_feedback": 0,
        "average_rating": 0,
        "ratings_distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
    }
