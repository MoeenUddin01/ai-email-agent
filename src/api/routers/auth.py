"""Authentication router for Supabase Auth."""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
import httpx
from supabase import create_client
from google.oauth2.credentials import Credentials
from typing import Optional

from src.api.config import settings
from src.email.gmail import GmailService

router = APIRouter()


class UserProfile(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture: str | None = None


async def verify_supabase_token(token: str) -> dict | None:
    """Verify Supabase JWT token."""
    try:
        response = await httpx.AsyncClient().get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.SUPABASE_SERVICE_KEY
            }
        )
        print(f"[Auth] Supabase verify status: {response.status_code}")
        if response.status_code == 200:
            return response.json()
        print(f"[Auth] Supabase verify failed body: {response.text[:200]}")
        return None
    except Exception as e:
        print(f"[Auth] verify_supabase_token exception: {e}")
        return None


# Alias for backwards compatibility
verify_token = verify_supabase_token


@router.get("/me", response_model=UserProfile)
async def get_current_user(request: Request):
    """Get current authenticated user."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    user_data = await verify_supabase_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return UserProfile(
        id=user_data["id"],
        email=user_data["email"],
        name=user_data.get("user_metadata", {}).get("full_name"),
        picture=user_data.get("user_metadata", {}).get("avatar_url"),
    )


@router.get("/gmail")
async def gmail_auth():
    """Start Gmail OAuth flow."""
    gmail_service = GmailService()
    auth_url = gmail_service.get_auth_url()
    return {"auth_url": auth_url}


@router.get("/gmail/callback")
async def gmail_callback(code: str, state: Optional[str] = None):
    """Handle Gmail OAuth callback."""
    try:
        gmail_service = GmailService()
        credentials = gmail_service.exchange_code(code)
        
        # Return success with tokens for frontend to handle
        return {
            "message": "Gmail connected successfully",
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gmail OAuth failed: {str(e)}")


@router.post("/gmail/store-credentials")
async def store_gmail_credentials(request: Request):
    """Store Gmail credentials for the authenticated user."""
    user_id = await get_current_user_id(request)
    data = await request.json()
    
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        
        # Store or update Gmail credentials
        credential_data = {
            "user_id": user_id,
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "scopes": GmailService.SCOPES,
            "updated_at": "now()"
        }
        
        # Upsert credentials
        supabase.table("gmail_credentials").upsert(credential_data).execute()
        
        return {"message": "Gmail credentials stored successfully", "status": "success"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store credentials: {str(e)}")


async def get_current_user_id(request: Request) -> str:
    """Extract user ID from JWT token."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    user_data = await verify_supabase_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return user_data["id"]
