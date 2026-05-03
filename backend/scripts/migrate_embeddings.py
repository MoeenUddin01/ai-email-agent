#!/usr/bin/env python3
"""Migration script to update embeddings from 1536 to 384 dimensions."""

import sys
from pathlib import Path
from supabase import create_client, Client

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from src.api.config import settings

def migrate_embeddings():
    """Drop and recreate knowledge_vectors table with 384 dimensions."""
    
    # Connect to Supabase
    supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    
    print("🔄 Migrating embeddings from 1536 to 384 dimensions...")
    
    try:
        # Drop existing table
        print("🗑️  Dropping existing knowledge_vectors table...")
        supabase.rpc('exec_sql', {'sql': 'DROP TABLE IF EXISTS knowledge_vectors CASCADE;'}).execute()
        
        # Recreate table with 384 dimensions
        print("📝 Creating new knowledge_vectors table with 384 dimensions...")
        create_table_sql = """
        CREATE TABLE knowledge_vectors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            content TEXT NOT NULL,
            metadata JSONB,
            embedding VECTOR(384) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX idx_knowledge_vectors_embedding ON knowledge_vectors USING ivfflat (embedding vector_cosine_ops);
        """
        
        supabase.rpc('exec_sql', {'sql': create_table_sql}).execute()
        
        # Update search function
        print("🔍 Updating vector search function...")
        update_function_sql = """
        CREATE OR REPLACE FUNCTION match_documents(
            query_embedding VECTOR(384),
            match_threshold FLOAT,
            match_count INT
        )
        RETURNS TABLE(
            id UUID,
            content TEXT,
            metadata JSONB,
            similarity FLOAT
        )
        LANGUAGE SQL
        AS $$
            SELECT
                kv.id,
                kv.content,
                kv.metadata,
                1 - (kv.embedding <=> query_embedding) as similarity
            FROM knowledge_vectors kv
            WHERE 1 - (kv.embedding <=> query_embedding) > match_threshold
            ORDER BY similarity DESC
            LIMIT match_count;
        $$;
        """
        
        supabase.rpc('exec_sql', {'sql': update_function_sql}).execute()
        
        print("✅ Migration completed successfully!")
        print("📊 Table now uses 384 dimensions for local embeddings.")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False
    
    return True

if __name__ == "__main__":
    # Add project root to path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    migrate_embeddings()
