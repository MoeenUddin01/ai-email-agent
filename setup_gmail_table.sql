-- Copy and paste this SQL into your Supabase SQL Editor
-- Go to: https://ggaguxnxeilsdxdfxgvc.supabase.co/project/sql

-- Create table for storing Gmail OAuth credentials
CREATE TABLE IF NOT EXISTS gmail_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_uri TEXT NOT NULL DEFAULT 'https://oauth2.googleapis.com/token',
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS (Row Level Security)
ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own credentials
CREATE POLICY "Users can view own gmail credentials" ON gmail_credentials
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gmail credentials" ON gmail_credentials
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gmail credentials" ON gmail_credentials
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gmail credentials" ON gmail_credentials
    FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gmail_credentials_user_id ON gmail_credentials(user_id);
