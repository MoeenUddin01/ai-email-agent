"""RAG (Retrieval-Augmented Generation) service."""

import hashlib
import pandas as pd
from typing import List
from openai import AsyncOpenAI
from groq import AsyncGroq
import numpy as np

from src.api.config import settings
from src.db.supabase import SupabaseService


def _simple_embed(text: str, dim: int = 768) -> List[float]:
    """Lightweight deterministic embedding using character n-gram hashing."""
    vec = np.zeros(dim, dtype=np.float32)
    for i, char in enumerate(text):
        idx = hash(f"{i}:{char}") % dim
        vec[idx] += 1.0
    for i in range(len(text) - 1):
        bigram = text[i:i+2]
        idx = hash(f"bg:{bigram}") % dim
        vec[idx] += 2.0
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


class RAGService:
    """Retrieval-Augmented Generation service for AI email replies."""

    def __init__(self):
        self.supabase = SupabaseService()
        real_openai_key = settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("sk-your")
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if real_openai_key else None
        self.gemini_client = None
        self.groq_client = None
        self.chat_model = "gpt-4"

        if settings.GEMINI_API_KEY:
            self.gemini_client = AsyncOpenAI(
                api_key=settings.GEMINI_API_KEY,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
            )
            self.chat_model = "gemini-2.0-flash"

        if settings.GROQ_API_KEY:
            self.groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            self.chat_model = "llama-3.3-70b-versatile"

    async def generate_embedding(self, text: str, force_simple: bool = False) -> List[float]:
        """Generate embedding vector for text."""
        if not force_simple:
            try:
                if settings.GEMINI_API_KEY:
                    import httpx
                    url = f"https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key={settings.GEMINI_API_KEY}"
                    async with httpx.AsyncClient(timeout=10) as client:
                        response = await client.post(url, json={
                            "model": "models/embedding-001",
                            "content": {"parts": [{"text": text[:2000]}]}
                        })
                        if response.status_code == 200:
                            data = response.json()
                            if "embedding" in data and "values" in data["embedding"]:
                                return data["embedding"]["values"]
            except Exception as e:
                print(f"Gemini embedding failed: {e}")

        return _simple_embed(text)

    async def ingest_csv(self, file_path: str, force_simple: bool = False) -> int:
        """Ingest CSV file into vector database."""
        df = pd.read_csv(file_path)

        count = 0
        for _, row in df.iterrows():
            content = self._row_to_text(row)
            metadata = row.to_dict()

            embedding = await self.generate_embedding(content, force_simple=force_simple)

            await self.supabase.store_vector(content, metadata, embedding)
            count += 1

        return count

    def _row_to_text(self, row: pd.Series) -> str:
        """Convert DataFrame row to text for embedding."""
        parts = []
        for col, val in row.items():
            if pd.notna(val):
                parts.append(f"{col}: {val}")
        return "\n".join(parts)

    async def search(self, query: str, limit: int = 5) -> List[dict]:
        """Search knowledge base — vector search with keyword fallback."""
        query_embedding = await self.generate_embedding(query)
        results = await self.supabase.search_vectors(query_embedding, limit, match_threshold=0.3)

        if results:
            print(f"Vector search returned {len(results)} results")
            return self._format_search_results(results)

        print("Vector search returned empty — trying keyword fallback")
        return await self._keyword_search(query, limit)

    def _format_search_results(self, results: list) -> List[dict]:
        return [
            {
                "id": r.get("id"),
                "content": r.get("content"),
                "metadata": r.get("metadata"),
                "similarity": r.get("similarity", 0),
            }
            for r in results
        ]

    async def _keyword_search(self, query: str, limit: int = 5) -> List[dict]:
        """Keyword-based search fallback. Always returns results if any doc matches."""
        try:
            result = self.supabase.client.table("knowledge_vectors").select("id,content,metadata").execute()
            docs = result.data or []
        except Exception as e:
            print(f"Keyword search fetch failed: {e}")
            return []

        if not docs:
            return []

        query_terms = set(w.lower() for w in query.split() if len(w) > 2)
        if not query_terms:
            return []

        scored = []
        for doc in docs:
            text = (doc.get("content") or "").lower()
            match_count = sum(1 for t in query_terms if t in text)
            if match_count:
                scored.append((doc, match_count / len(query_terms)))

        scored.sort(key=lambda x: x[1], reverse=True)

        print(f"Keyword search: {len(scored)} matches from {len(docs)} docs")
        return [
            {"id": d["id"], "content": d["content"], "metadata": d.get("metadata", {}), "similarity": round(s, 4)}
            for d, s in scored[:limit]
        ]

    async def generate_reply(self, email_content: str, sender: str, subject: str) -> dict:
        """Generate AI reply for email."""
        print(f"DEBUG: RAG service - checking LLM clients...")
        print(f"DEBUG: Gemini client (OpenAI-compatible): {self.gemini_client is not None}")
        print(f"DEBUG: OpenAI client: {self.openai_client is not None}")
        print(f"DEBUG: Groq client: {self.groq_client is not None}")

        if not self.gemini_client and not self.openai_client and not self.groq_client:
            print("DEBUG: No LLM client configured - returning mock response")
            return {
                "draft_content": f"Hi {sender},\n\nThank you for your email regarding: {subject}\n\nThis is a mock AI-generated reply. The system is working but needs LLM API keys configured to generate real responses.\n\nBest regards,\nAI Email Agent",
                "model_used": "mock",
                "retrieved_context": {
                    "documents": [],
                    "context_text": "No context available - mock response",
                },
            }

        print("DEBUG: Searching for relevant documents...")
        search_query = f"Subject: {subject}\nBody: {email_content[:500]}"
        relevant_docs = await self.search(search_query, limit=3)
        context = self._build_context(relevant_docs)
        print(f"DEBUG: Found {len(relevant_docs)} relevant documents")

        print("DEBUG: Building prompt and generating reply...")
        system_prompt, user_prompt = self._build_prompt(email_content, sender, subject, context)

        reply = None
        model_used = None
        errors = []

        model_context_windows = {
            "llama-3.3-70b-versatile": 131072,
            "gpt-4": 8192,
            "gemini-2.0-flash": 1048576,
        }
        providers = [
            ("groq", self.groq_client, "llama-3.3-70b-versatile"),
            ("openai", self.openai_client, "gpt-4"),
            ("gemini", self.gemini_client, "gemini-2.0-flash"),
        ]

        for provider_name, client, model in providers:
            if not client:
                continue
            try:
                print(f"DEBUG: Trying {provider_name} with model {model}...")
                response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.7,
                    max_tokens=1000
                )
                reply = response.choices[0].message.content
                model_used = model
                print(f"DEBUG: Successfully generated reply using {provider_name}")
                break
            except Exception as e:
                error_msg = str(e)
                print(f"DEBUG: {provider_name} failed: {error_msg[:100]}...")
                errors.append(f"{provider_name}: {error_msg[:100]}")
                continue

        if not reply:
            raise Exception(f"All LLM providers failed: {'; '.join(errors)}")

        full_prompt_text = f"System: {system_prompt}\nUser: {user_prompt}"
        estimated_prompt_tokens = len(full_prompt_text) // 4
        max_context = model_context_windows.get(model_used, 8192)

        return {
            "draft_content": reply,
            "model_used": model_used,
            "retrieved_context": {
                "documents": relevant_docs,
                "context_text": context,
            },
            "token_info": {
                "estimated_prompt_tokens": estimated_prompt_tokens,
                "max_context_window": max_context,
                "usage_pct": round(estimated_prompt_tokens / max_context * 100, 1),
            },
        }

    def _build_context(self, documents: List[dict]) -> str:
        """Build context string from retrieved documents."""
        if not documents:
            return "No relevant documents found."

        parts = []
        for i, doc in enumerate(documents, 1):
            parts.append(f"[Document {i}]\n{doc['content']}\n")

        return "\n".join(parts)

    def _build_prompt(self, email_content: str, sender: str, subject: str, context: str) -> tuple[str, str]:
        """Build system prompt and user message for LLM."""
        system = (
            "You draft professional email replies for a course/program advisor. "
            "Use the provided context to answer accurately. "
            "If context lacks relevant info, acknowledge it and offer general help. "
            "Keep replies concise and helpful. Never make up facts."
        )
        user = (
            f"From: {sender}\n"
            f"Subject: {subject}\n"
            f"Body:\n{email_content}\n\n"
            f"Relevant context:\n{context}"
        )
        return system, user
