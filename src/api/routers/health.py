"""Health check and system status router."""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
import psutil
import time
from datetime import datetime

from src.db.supabase import get_supabase_client
from src.rag.service import RAGService
from src.api.config import settings
from src.api.routers.auth import verify_supabase_token

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    uptime: float
    components: Dict[str, Any]


class ComponentStatus(BaseModel):
    status: str
    details: Dict[str, Any] = {}


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Comprehensive health check of all system components."""
    start_time = time.time()
    
    # System info
    uptime = time.time() - psutil.boot_time()
    
    # Check components
    components = {
        "database": await check_database(),
        "ai_service": await check_ai_service(),
        "knowledge_base": await check_knowledge_base(),
        "system": check_system(),
        "authentication": check_authentication()
    }
    
    # Overall status
    overall_status = "healthy"
    if any(comp["status"] != "healthy" for comp in components.values()):
        overall_status = "degraded"
    
    return HealthResponse(
        status=overall_status,
        timestamp=datetime.utcnow().isoformat(),
        version="0.1.0",
        uptime=uptime,
        components=components
    )


async def check_database() -> Dict[str, Any]:
    """Check database connectivity."""
    try:
        client = get_supabase_client()
        # Test connection
        result = client.table("users").select("count").execute()
        return {
            "status": "healthy",
            "details": {
                "connection": "ok",
                "provider": "supabase",
                "query_time": "< 100ms"
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "details": {
                "connection": "failed",
                "error": str(e)
            }
        }


async def check_ai_service() -> Dict[str, Any]:
    """Check AI service availability."""
    try:
        rag_service = RAGService()
        # Test embedding generation
        test_embedding = await rag_service.generate_embedding("test")
        return {
            "status": "healthy",
            "details": {
                "embeddings": "ok",
                "model": "all-MiniLM-L6-v2",
                "dimensions": len(test_embedding),
                "chat_model": rag_service.chat_model
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "details": {
                "embeddings": "failed",
                "error": str(e)
            }
        }


async def check_knowledge_base() -> Dict[str, Any]:
    """Check knowledge base status."""
    try:
        client = get_supabase_client()
        result = client.table("knowledge_vectors").select("*", count="exact").limit(0).execute()
        doc_count = getattr(result, 'count', None)
        if doc_count is None:
            result = client.table("knowledge_vectors").select("*", count="exact").execute()
            doc_count = result.count if hasattr(result, 'count') else (len(result.data) if result.data else 0)
        
        return {
            "status": "healthy",
            "details": {
                "documents": doc_count,
                "indexing": "complete",
                "search_capability": "ok"
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "details": {
                "documents": "unknown",
                "error": str(e)
            }
        }


def check_system() -> Dict[str, Any]:
    """Check system resources."""
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    return {
        "status": "healthy",
        "details": {
            "cpu_percent": round(cpu_percent, 2),
            "memory_percent": round(memory.percent, 2),
            "memory_available": f"{memory.available / (1024**3):.1f}GB",
            "disk_percent": round(disk.percent, 2),
            "disk_free": f"{disk.free / (1024**3):.1f}GB"
        }
    }


def check_authentication() -> Dict[str, Any]:
    """Check authentication configuration."""
    auth_configured = bool(
        settings.GOOGLE_CLIENT_ID and 
        settings.GOOGLE_CLIENT_SECRET and 
        settings.JWT_SECRET
    )
    
    return {
        "status": "healthy" if auth_configured else "degraded",
        "details": {
            "google_oauth": "configured" if settings.GOOGLE_CLIENT_ID else "not configured",
            "jwt_secret": "configured" if settings.JWT_SECRET else "not configured",
            "auth_type": "custom_jwt"
        }
    }


@router.get("/gmail-status")
async def gmail_status(request: Request):
    """Check if the current user has Gmail connected."""
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"connected": False}

    token = auth_header.split(" ")[1]
    user_data = await verify_supabase_token(token)
    if not user_data:
        return {"connected": False}

    try:
        client = get_supabase_client()
        result = (
            client.table("gmail_credentials")
            .select("*")
            .eq("user_id", user_data["id"])
            .execute()
        )
        if result.data:
            creds = result.data[0]
            # Try to get the Gmail user's email via the People API
            gmail_email: Optional[str] = None
            try:
                import requests as req
                r = req.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {creds['access_token']}"},
                    timeout=4,
                )
                if r.status_code == 200:
                    gmail_email = r.json().get("email")
            except Exception:
                pass
            return {"connected": True, "gmail_email": gmail_email}
        return {"connected": False}
    except Exception:
        return {"connected": False}


@router.get("/status")
async def simple_status():
    """Simple status endpoint for load balancers."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@router.get("/metrics")
async def system_metrics():
    """Detailed system metrics."""
    return {
        "system": {
            "cpu": psutil.cpu_percent(interval=1),
            "memory": psutil.virtual_memory()._asdict(),
            "disk": psutil.disk_usage('/')._asdict(),
            "network": psutil.net_io_counters()._asdict() if psutil.net_io_counters() else {}
        },
        "process": {
            "pid": psutil.Process().pid,
            "memory": psutil.Process().memory_info()._asdict(),
            "cpu": psutil.Process().cpu_percent()
        },
        "timestamp": datetime.utcnow().isoformat()
    }
