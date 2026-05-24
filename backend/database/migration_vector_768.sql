-- Migration: VECTOR(384) → VECTOR(768) for Gemini embeddings
-- Run this in Supabase SQL Editor

-- 1. Delete old 384-dim data (will be re-ingested automatically)
TRUNCATE TABLE knowledge_vectors;

-- 2. Change column type to support Gemini's 768-dim embeddings
ALTER TABLE knowledge_vectors ALTER COLUMN embedding TYPE VECTOR(768);

-- 3. Drop old function and recreate with VECTOR(768)
DROP FUNCTION IF EXISTS match_documents;

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(768),
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
        knowledge_vectors.id,
        knowledge_vectors.content,
        knowledge_vectors.metadata,
        1 - (knowledge_vectors.embedding <=> query_embedding) AS similarity
    FROM knowledge_vectors
    WHERE 1 - (knowledge_vectors.embedding <=> query_embedding) > match_threshold
    ORDER BY knowledge_vectors.embedding <=> query_embedding
    LIMIT match_count;
$$;
