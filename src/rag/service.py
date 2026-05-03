"""RAG (Retrieval-Augmented Generation) service."""

import pandas as pd
from typing import List
import google.generativeai as genai
from openai import AsyncOpenAI
from groq import AsyncGroq
from sentence_transformers import SentenceTransformer
import numpy as np

from src.api.config import settings
from src.db.supabase import SupabaseService


class RAGService:
    """Retrieval-Augmented Generation service for AI email replies."""
    
    def __init__(self):
        self.supabase = SupabaseService()
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
        self.gemini_client = None
        self.groq_client = None
        self.embedding_model = "all-MiniLM-L6-v2"
        self.chat_model = "gpt-4"
        
        # Initialize local embeddings (force CPU to avoid CUDA issues)
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
        
        # Initialize Gemini if key is available
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.gemini_client = genai.GenerativeModel('gemini-pro')
            self.chat_model = "gemini-pro"
        
        # Initialize Groq if key is available
        if settings.GROQ_API_KEY:
            self.groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            self.chat_model = "llama3-70b-8192"
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector for text."""
        # Use local sentence-transformers for embeddings
        embedding = self.embedding_model.encode(text)
        return embedding.tolist()
    
    async def ingest_csv(self, file_path: str) -> int:
        """Ingest CSV file into vector database."""
        df = pd.read_csv(file_path)
        
        count = 0
        for _, row in df.iterrows():
            content = self._row_to_text(row)
            metadata = row.to_dict()
            
            embedding = await self.generate_embedding(content)
            
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
        """Search knowledge base for relevant documents."""
        query_embedding = await self.generate_embedding(query)
        
        results = await self.supabase.search_vectors(query_embedding, limit)
        
        return [
            {
                "id": r.get("id"),
                "content": r.get("content"),
                "metadata": r.get("metadata"),
                "similarity": r.get("similarity", 0),
            }
            for r in results
        ]
    
    async def generate_reply(self, email_content: str, sender: str, subject: str) -> dict:
        """Generate AI reply for email."""
        if not self.gemini_client and not self.openai_client and not self.groq_client:
            raise ValueError("No LLM client configured")
        
        # Search for relevant documents
        search_query = f"Subject: {subject}\nBody: {email_content[:500]}"
        relevant_docs = await self.search(search_query, limit=3)
        context = self._build_context(relevant_docs)
        
        # Generate reply using LLM
        prompt = self._build_prompt(email_content, sender, subject, context)
        
        if self.groq_client:
            # Use Groq
            response = await self.groq_client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that drafts email replies."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            reply = response.choices[0].message.content
        elif self.gemini_client:
            # Use Gemini
            response = self.gemini_client.generate_content(prompt)
            reply = response.text
        else:
            # Use OpenAI
            response = await self.openai_client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that drafts email replies."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            reply = response.choices[0].message.content
        
        return {
            "draft_content": reply,
            "model_used": self.chat_model,
            "retrieved_context": {
                "documents": relevant_docs,
                "context_text": context,
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
    
    def _build_prompt(self, email_content: str, sender: str, subject: str, context: str) -> str:
        """Build prompt for LLM."""
        return f"""You received an email that requires a reply.

EMAIL DETAILS:
From: {sender}
Subject: {subject}
Body:
{email_content}

RELEVANT CONTEXT FROM KNOWLEDGE BASE:
{context}

Please craft a professional, helpful reply to this email. Use the provided context to answer questions accurately about courses and programs. If the context doesn't contain relevant information, acknowledge that and offer to help further.

Write the reply as if you are responding directly to the sender."""
