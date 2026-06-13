-- AI Email Agent - Full Schema with VECTOR(768)
-- Run once on new Supabase project

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS ai_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    draft_content TEXT NOT NULL,
    model_used TEXT NOT NULL,
    retrieved_context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sent_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    ai_draft_id UUID REFERENCES ai_drafts(id) ON DELETE SET NULL,
    final_content TEXT NOT NULL,
    was_modified BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gmail_message_id TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(768) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_email_id UUID NOT NULL REFERENCES sent_emails(id) ON DELETE CASCADE,
    star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
    text_feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_email_id ON ai_drafts(email_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_email_id ON sent_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sent_email_id ON feedback(sent_email_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_credentials_user_id ON gmail_credentials(user_id);

-- Vector similarity search function (VECTOR(768) for Gemini embeddings)
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT
)
RETURNS TABLE(id UUID, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL
AS $$
    SELECT knowledge_vectors.id, knowledge_vectors.content, knowledge_vectors.metadata,
           1 - (knowledge_vectors.embedding <=> query_embedding) AS similarity
    FROM knowledge_vectors
    WHERE 1 - (knowledge_vectors.embedding <=> query_embedding) > match_threshold
    ORDER BY knowledge_vectors.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can only see their own data" ON users
    FOR ALL USING (auth.uid()::text = id::text);

CREATE POLICY "Users can only see their own emails" ON emails
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only see their own drafts" ON ai_drafts
    FOR ALL USING (email_id IN (SELECT id FROM emails WHERE user_id::text = auth.uid()::text));

CREATE POLICY "Users can only see their own sent emails" ON sent_emails
    FOR ALL USING (email_id IN (SELECT id FROM emails WHERE user_id::text = auth.uid()::text));

CREATE POLICY "Users can only see their own feedback" ON feedback
    FOR ALL USING (sent_email_id IN (
        SELECT se.id FROM sent_emails se JOIN emails e ON se.email_id = e.id WHERE e.user_id::text = auth.uid()::text
    ));

-- Allow service_role to read knowledge_vectors (for RAG)
CREATE POLICY "Service role can manage knowledge vectors" ON knowledge_vectors
    FOR ALL USING (true);

-- Create gmail_credentials table
CREATE TABLE IF NOT EXISTS gmail_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_uri TEXT DEFAULT 'https://oauth2.googleapis.com/token',
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    scopes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gmail credentials" ON gmail_credentials
    FOR ALL USING (user_id::text = auth.uid()::text);
