"""Supabase client service."""

from supabase import create_client, Client
from functools import lru_cache
from src.api.config import settings


@lru_cache()
def get_supabase_client() -> Client:
    """Get cached Supabase client."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class SupabaseService:
    """Supabase database operations."""
    
    def __init__(self):
        self.client = get_supabase_client()
    
    async def store_email(self, email_data: dict) -> dict:
        """Store an email in the database."""
        result = self.client.table("emails").insert(email_data).execute()
        return result.data[0] if result.data else None
    
    async def get_email(self, email_id: str) -> dict | None:
        """Get an email by ID."""
        result = self.client.table("emails").select("*").eq("id", email_id).single().execute()
        return result.data
    
    async def store_ai_draft(self, draft_data: dict) -> dict:
        """Store an AI-generated draft."""
        result = self.client.table("ai_drafts").insert(draft_data).execute()
        return result.data[0] if result.data else None
    
    async def store_sent_email(self, sent_data: dict) -> dict:
        """Store a sent email."""
        result = self.client.table("sent_emails").insert(sent_data).execute()
        return result.data[0] if result.data else None
    
    async def store_feedback(self, feedback_data: dict) -> dict:
        """Store user feedback."""
        result = self.client.table("feedback").insert(feedback_data).execute()
        return result.data[0] if result.data else None
    
    async def search_vectors(self, query_embedding: list, limit: int = 5) -> list:
        """Search knowledge vectors using similarity."""
        result = self.client.rpc(
            "match_documents",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.7,
                "match_count": limit,
            }
        ).execute()
        return result.data
    
    async def store_vector(self, content: str, metadata: dict, embedding: list) -> dict:
        """Store a document with its vector embedding."""
        data = {
            "content": content,
            "metadata": metadata,
            "embedding": embedding,
        }
        result = self.client.table("knowledge_vectors").insert(data).execute()
        return result.data[0] if result.data else None
