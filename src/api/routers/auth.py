"""Authentication router for Supabase Auth."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from supabase import create_client

from src.api.config import settings

router = APIRouter()


class UserProfile(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture: str | None = None


async def verify_supabase_token(token: str) -> dict | None:
    """Verify Supabase JWT token."""
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        response = await httpx.AsyncClient().get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.SUPABASE_SERVICE_KEY
            }
        )
        
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
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
