"""
AI Email Agent Backend
FastAPI application for Gmail integration, RAG, and AI reply generation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import uvicorn

from src.api.routers import auth, emails, drafts, feedback, knowledge, health
from src.api.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("Starting AI Email Agent Backend...")
    yield
    print("Shutting down AI Email Agent Backend...")


app = FastAPI(
    title="AI Email Agent API",
    description="Backend API for AI-powered Gmail reply agent with RAG",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
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

# Mount static files
app.mount("/static", StaticFiles(directory="src/api/static"), name="static")


@app.get("/")
async def root():
    """Serve the attractive landing page."""
    return FileResponse("src/api/static/index.html")


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
