"""Authentication router for Supabase Auth with local JWT verification."""

import json
import os
import traceback

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client
from google.oauth2.credentials import Credentials
from typing import Optional

from src.api.config import settings
from src.email.gmail import GmailService

router = APIRouter()

_http_client = None
_jwks_cache = None
_JWKS_CACHE_FILE = "/tmp/supabase_jwks.json"


def get_http_client(timeout=10.0):
    global _http_client
    if _http_client is None:
        import httpx
        _http_client = httpx.AsyncClient(timeout=timeout)
    return _http_client


class UserProfile(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture: str | None = None


def _load_jwks_cache():
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    if os.path.exists(_JWKS_CACHE_FILE):
        try:
            with open(_JWKS_CACHE_FILE) as f:
                _jwks_cache = json.load(f)
        except Exception:
            pass
    return _jwks_cache


def _save_jwks_cache(keys):
    global _jwks_cache
    _jwks_cache = keys
    try:
        with open(_JWKS_CACHE_FILE, "w") as f:
            json.dump(keys, f)
    except Exception:
        pass


async def verify_supabase_token(token: str) -> dict | None:
    """Verify Supabase JWT via Supabase's own auth API."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.SUPABASE_ANON_KEY,
                },
            )
            if response.status_code == 200:
                data = response.json()
                print(f"[Auth] verified user {data.get('id', '?')[:12]}...")
                return data
            print(f"[Auth] HTTP verify failed: {response.status_code} {response.text[:100]}")
    except Exception as e:
        print(f"[Auth] HTTP verify exception: {type(e).__name__}")
    return None


verify_token = verify_supabase_token


@router.get("/me", response_model=UserProfile)
async def get_current_user(request: Request):
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
    gmail_service = GmailService()
    auth_url = gmail_service.get_auth_url()
    return {"auth_url": auth_url}


@router.get("/gmail/callback")
async def gmail_callback(code: str, state: Optional[str] = None):
    try:
        gmail_service = GmailService()
        credentials = gmail_service.exchange_code(code)
        return {
            "message": "Gmail connected successfully",
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "status": "success",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gmail OAuth failed: {str(e)}")


@router.post("/gmail/store-credentials")
async def store_gmail_credentials(request: Request):
    user_id = await get_current_user_id(request)
    data = await request.json()
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        credential_data = {
            "user_id": user_id,
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "scopes": GmailService.SCOPES,
            "updated_at": "now()",
        }
        supabase.table("gmail_credentials").upsert(credential_data).execute()
        return {"message": "Gmail credentials stored successfully", "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store credentials: {str(e)}")


async def get_current_user_id(request: Request) -> str:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    user_data = await verify_supabase_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_data["id"]
