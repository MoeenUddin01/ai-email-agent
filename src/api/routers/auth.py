"""Authentication router for Supabase Auth with local JWT verification."""

import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, HTMLResponse
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


async def get_current_user_id(request: Request) -> str:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    user_data = await verify_supabase_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_data["id"]


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
async def gmail_auth(request: Request):
    """Start Gmail OAuth flow — redirect URI points to backend."""
    user_id = await get_current_user_id(request)
    gmail_service = GmailService()
    auth_url = gmail_service.get_auth_url(state=user_id)
    return {"auth_url": auth_url, "redirect_uri": settings.GMAIL_REDIRECT_URI, "backend_url": settings.BACKEND_URL}


_bcall_db = None
def _get_bcall_db():
    """Lazy init supabase client for callback logging."""
    global _bcall_db
    if _bcall_db is None:
        _bcall_db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _bcall_db


def _clog(msg: str, detail: str = ""):
    """Log callback step to callback_logs table (persistent across containers)."""
    try:
        db = _get_bcall_db()
        full = f"{msg} {detail}".strip()
        db.table("callback_logs").insert({
            "message": msg,
            "details": full,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass  # logging must never break the callback


@router.get("/gmail/callback", response_class=HTMLResponse)
async def gmail_callback(code: str, state: Optional[str] = None, error: Optional[str] = None):
    """Handle Gmail OAuth redirect — exchange code, store credentials, redirect to frontend."""
    _clog("callback_started", f"code_len={len(code) if code else 0} state={state[:20] if state else 'none'}")
    if error:
        _clog("google_error", error)
        return _cb_html("error", f"Google returned: {error}")

    if not code:
        _clog("no_code")
        return _cb_html("error", "No authorization code received from Google")

    if not state:
        _clog("no_state")
        return _cb_html("error", "No user ID (state) received from Google")

    try:
        gmail_service = GmailService()
        credentials = gmail_service.exchange_code(code)
        user_id = state
        _clog("code_exchanged", f"has_refresh={bool(credentials.refresh_token)}")

        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

        # 1. Ensure a user record exists in public.users (FK requirement)
        try:
            existing_user = supabase.table("users").select("id").eq("id", user_id).execute()
            if not existing_user.data:
                ins = supabase.table("users").insert({
                    "id": user_id,
                    "email": "",
                    "google_id": user_id,
                    "name": "",
                }).execute()
                if not ins.data:
                    raise Exception("INSERT returned no data")
                _clog("user_created")
            else:
                _clog("user_exists")
        except Exception as e:
            em = str(e)[:60]
            _clog("user_create_failed", em)
            return _cb_html("error", f"Failed to create user: {em}")

        # 2. Preserve existing refresh_token if Google didn't return a new one
        refresh_token = credentials.refresh_token
        if not refresh_token:
            try:
                existing = supabase.table("gmail_credentials").select("refresh_token").eq("user_id", user_id).execute()
                if existing.data:
                    refresh_token = existing.data[0].get("refresh_token")
            except Exception:
                pass

        credential_data = {
            "user_id": user_id,
            "access_token": credentials.token,
            "refresh_token": refresh_token or "",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "scopes": GmailService.SCOPES,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        # 3. Store credentials using explicit check-then-insert-or-update
        try:
            existing_creds = supabase.table("gmail_credentials").select("id").eq("user_id", user_id).execute()
            if existing_creds.data:
                supabase.table("gmail_credentials").update(credential_data).eq("user_id", user_id).execute()
                _clog("creds_updated")
            else:
                supabase.table("gmail_credentials").insert(credential_data).execute()
                _clog("creds_inserted")
        except Exception as e:
            em = str(e)[:60]
            _clog("creds_store_failed", em)
            return _cb_html("error", f"Failed to store credentials: {em}")

        _clog("SUCCESS_stored")
        return _cb_html("success", "Gmail connected! Redirecting to inbox...")

    except Exception as e:
        _clog("callback_exception", str(e)[:80])
        return _cb_html("error", str(e)[:100])


def _cb_html(status: str, message: str) -> str:
    """Return an HTML page that redirects via JavaScript (more reliable than 307)."""
    redirect_url = f"{settings.FRONTEND_URL}/inbox?gmail={status}"
    if status == "error":
        from urllib.parse import quote
        redirect_url += "&msg=" + quote(message[:120])
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>{'Success' if status == 'success' else 'Error'} - AI Email Agent</title>
<script>
window.location.href = "{redirect_url}";
</script>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0d0f14; color: #e8eaf0; }}
.card {{ text-align: center; padding: 40px; }}
.msg {{ font-size: 14px; color: {'#86efac' if status == 'success' else '#fca5a5'}; }}
</style>
</head><body>
<div class="card">
<p class="msg">{message}</p>
<p style="font-size:12px;color:#555d78">Redirecting...</p>
<noscript><a href="{redirect_url}">Click here to continue</a></noscript>
</div></body></html>"""



@router.post("/gmail/store-credentials")
async def store_gmail_credentials(request: Request):
    """Store Gmail credentials (for backward compatibility with old flow)."""
    user_id = await get_current_user_id(request)
    data = await request.json()
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

        # Ensure user exists
        existing_user = supabase.table("users").select("id").eq("id", user_id).execute()
        if not existing_user.data:
            supabase.table("users").insert({
                "id": user_id,
                "email": "",
                "google_id": user_id,
                "name": "",
            }).execute()

        # Check existing credentials
        existing_creds = supabase.table("gmail_credentials").select("id").eq("user_id", user_id).execute()
        credential_data = {
            "user_id": user_id,
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": data.get("client_id", settings.GMAIL_CLIENT_ID),
            "client_secret": data.get("client_secret", settings.GMAIL_CLIENT_SECRET),
            "scopes": GmailService.SCOPES,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if existing_creds.data:
            supabase.table("gmail_credentials").update(credential_data).eq("user_id", user_id).execute()
        else:
            supabase.table("gmail_credentials").insert(credential_data).execute()

        return {"status": "success", "message": "Credentials stored successfully", "user_id": user_id}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gmail/check")
async def check_gmail_connection(request: Request):
    """Check if the current user has Gmail credentials stored."""
    user_id = await get_current_user_id(request)
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    result = supabase.table("gmail_credentials").select("*").eq("user_id", user_id).execute()
    if result.data:
        creds = result.data[0]
        return {
            "connected": True,
            "has_refresh": bool(creds.get("refresh_token")),
            "updated_at": creds.get("updated_at"),
            "user_id": user_id,
        }
    return {"connected": False, "user_id": user_id}


@router.get("/gmail/callback-logs")
async def get_callback_logs():
    """Return callback logs from database."""
    try:
        db = _get_bcall_db()
        result = db.table("callback_logs").select("*").order("created_at", desc=True).limit(50).execute()
        return {"logs": result.data if result.data else [], "count": len(result.data) if result.data else 0}
    except Exception as e:
        return {"logs": [], "error": str(e)}


@router.get("/gmail/client-id")
async def get_gmail_client_id():
    """Return the Gmail OAuth client ID for the frontend."""
    return {"client_id": settings.GMAIL_CLIENT_ID}


@router.post("/gmail/exchange")
async def exchange_gmail_code(request: Request):
    """Exchange an authorization code for Gmail credentials (GIS popup flow)."""
    user_id = await get_current_user_id(request)
    data = await request.json()
    code = data.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code provided")

    try:
        gmail_service = GmailService()
        # GIS popup uses 'postmessage' redirect_uri (not the server callback URL)
        credentials = gmail_service.exchange_code(code, redirect_uri="postmessage")

        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

        # Ensure user record exists
        existing_user = supabase.table("users").select("id").eq("id", user_id).execute()
        if not existing_user.data:
            supabase.table("users").insert({
                "id": user_id, "email": "", "google_id": user_id, "name": "",
            }).execute()

        # Preserve existing refresh_token if Google didn't return a new one
        refresh_token = credentials.refresh_token
        if not refresh_token:
            existing = supabase.table("gmail_credentials").select("refresh_token").eq("user_id", user_id).execute()
            if existing.data:
                refresh_token = existing.data[0].get("refresh_token")

        credential_data = {
            "user_id": user_id,
            "access_token": credentials.token,
            "refresh_token": refresh_token or "",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "scopes": GmailService.SCOPES,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        existing_creds = supabase.table("gmail_credentials").select("id").eq("user_id", user_id).execute()
        if existing_creds.data:
            supabase.table("gmail_credentials").update(credential_data).eq("user_id", user_id).execute()
        else:
            supabase.table("gmail_credentials").insert(credential_data).execute()

        return {"status": "success", "message": "Gmail connected", "user_id": user_id}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to exchange code: {str(e)}")


@router.get("/gmail/manual", response_class=HTMLResponse)
async def gmail_manual_auth():
    """Manual Gmail auth page — user visits this directly via browser URL bar."""
    gmail_service = GmailService()
    auth_url = gmail_service.get_auth_url(state="manual-flow-no-state")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Connect Gmail - AI Email Agent</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0d0f14; color: #e8eaf0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
.card {{ background: #12151c; border: 1px solid #232840; border-radius: 12px; padding: 40px; max-width: 500px; text-align: center; }}
h1 {{ font-size: 20px; margin: 0 0 10px; }}
p {{ font-size: 13px; color: #8b91a8; line-height: 1.6; margin: 0 0 20px; }}
.btn {{ display: inline-block; padding: 12px 24px; background: #4f7ef8; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; }}
.btn:hover {{ background: #5d8aff; }}
</style>
</head><body>
<div class="card">
<h1>Connect Your Gmail</h1>
<p>Click the button below to authorize AI Email Agent to read and send emails on your behalf.</p>
<p style="font-size:12px;color:#555d78">After authorizing, you'll be redirected back to the app.</p>
<a class="btn" href="{auth_url}">Authorize Gmail Access</a>
</div></body></html>"""
