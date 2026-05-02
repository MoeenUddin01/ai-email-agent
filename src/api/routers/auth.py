"""Authentication router for Google OAuth."""

from fastapi import APIRouter, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt, JWTError
import httpx

from src.api.config import settings

router = APIRouter()

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture: str | None = None


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


@router.get("/google")
async def google_login():
    """Initiate Google OAuth login."""
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={settings.BACKEND_URL}/auth/google/callback"
        f"&response_type=code"
        f"&scope=openid email profile"
        f"&access_type=offline"
    )
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(code: str, response: Response):
    """Handle Google OAuth callback."""
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": f"{settings.BACKEND_URL}/auth/google/callback",
        "grant_type": "authorization_code",
    }
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_data)
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        
        user_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        
        user_info = user_response.json()
    
    user_data = {
        "sub": user_info["id"],
        "email": user_info["email"],
        "name": user_info.get("name"),
        "picture": user_info.get("picture"),
    }
    jwt_token = create_access_token(user_data)
    
    frontend_callback = f"{settings.FRONTEND_URL}/auth/callback?token={jwt_token}"
    return RedirectResponse(url=frontend_callback)


@router.get("/me", response_model=UserProfile)
async def get_current_user(request: Request):
    """Get current authenticated user."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return UserProfile(
        id=payload["sub"],
        email=payload["email"],
        name=payload.get("name"),
        picture=payload.get("picture"),
    )
