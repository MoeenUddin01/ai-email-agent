"""
AI Email Agent Backend
FastAPI application for Gmail integration, RAG, and AI reply generation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from src.api.routers import auth, emails, drafts, feedback, knowledge, health
from src.api.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("Starting AI Email Agent Backend...")
    await auto_ingest_knowledge_base()
    yield
    print("Shutting down AI Email Agent Backend...")


async def auto_ingest_knowledge_base():
    """Auto-ingest CSV knowledge base if empty."""
    from pathlib import Path
    from src.rag.service import RAGService
    from src.db.supabase import get_supabase_client

    try:
        client = get_supabase_client()
        existing = client.table("knowledge_vectors").select("id").limit(1).execute()
        if existing.data:
            print(f"Knowledge base already populated — skipping auto-ingest")
            return

        csv_path = None
        for parent in Path(__file__).resolve().parents:
            candidate = parent / "data" / "vizaura_courses_dataset.csv"
            if candidate.exists():
                csv_path = candidate
                break

        if csv_path:
            print(f"Auto-ingesting knowledge base from {csv_path}...")
            rag = RAGService()
            count = await rag.ingest_csv(str(csv_path))
            print(f"Ingested {count} documents into knowledge base")
        else:
            print("Warning: CSV knowledge base not found — skipping auto-ingest")
    except Exception as e:
        print(f"Warning: auto-ingest failed ({e}) — continuing without knowledge base")


app = FastAPI(
    title="AI Email Agent API",
    description="Backend API for AI-powered Gmail reply agent with RAG",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://frontend-taupe-iota-69.vercel.app",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(emails.router, prefix="/emails", tags=["Emails"])
app.include_router(drafts.router, prefix="/drafts", tags=["AI Drafts"])
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge Base"])
app.include_router(health.router, prefix="/health", tags=["Health"])

@app.get("/ping")
async def ping():
    """Simple ping for load balancers."""
    return {"status": "ok"}


def main():
    """Entry point for the application."""
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )


if __name__ == "__main__":
    main()
