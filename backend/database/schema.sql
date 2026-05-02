-- AI Email Agent Database Schema
-- Run this in Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emails table
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_id TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    subject TEXT,
    body_text TEXT,
    snippet TEXT,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'processed', 'replied')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Drafts table
CREATE TABLE IF NOT EXISTS ai_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    draft_content TEXT NOT NULL,
    model_used TEXT NOT NULL,
    retrieved_context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sent Emails table
CREATE TABLE IF NOT EXISTS sent_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    ai_draft_id UUID REFERENCES ai_drafts(id) ON DELETE SET NULL,
    final_content TEXT NOT NULL,
    was_modified BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gmail_message_id TEXT
);

-- Knowledge Vectors table (for RAG)
CREATE TABLE IF NOT EXISTS knowledge_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_email_id UUID NOT NULL REFERENCES sent_emails(id) ON DELETE CASCADE,
    star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
    text_feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_email_id ON ai_drafts(email_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_email_id ON sent_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sent_email_id ON feedback(sent_email_id);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(1536),
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

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can only see their own data" ON users
    FOR ALL USING (auth.uid()::text = id::text);

CREATE POLICY "Users can only see their own emails" ON emails
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only see their own drafts" ON ai_drafts
    FOR ALL USING (
        email_id IN (
            SELECT id FROM emails WHERE user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can only see their own sent emails" ON sent_emails
    FOR ALL USING (
        email_id IN (
            SELECT id FROM emails WHERE user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can only see their own feedback" ON feedback
    FOR ALL USING (
        sent_email_id IN (
            SELECT se.id FROM sent_emails se
            JOIN emails e ON se.email_id = e.id
            WHERE e.user_id::text = auth.uid()::text
        )
    );

-- Feedback statistics function
CREATE OR REPLACE FUNCTION get_user_feedback_stats(user_id UUID)
RETURNS TABLE (
    total_count BIGINT,
    average_rating NUMERIC,
    distribution JSONB
)
LANGUAGE SQL
AS $$
    SELECT
        COUNT(*)::BIGINT as total_count,
        ROUND(AVG(f.star_rating), 2) as average_rating,
        jsonb_object_agg(
            COALESCE(f.star_rating::text, '0'),
            COALESCE(counts.cnt, 0)
        ) as distribution
    FROM feedback f
    JOIN sent_emails se ON f.sent_email_id = se.id
    JOIN emails e ON se.email_id = e.id
    WHERE e.user_id = user_id
    GROUP BY e.user_id;
$$;
