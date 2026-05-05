-- Create user_credentials table for storing OAuth tokens
CREATE TABLE IF NOT EXISTS public.user_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'gmail', 'outlook', etc.
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scope TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider)
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read/write their own credentials
CREATE POLICY "Users can manage their own credentials" ON public.user_credentials
    FOR ALL USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_provider ON public.user_credentials(user_id, provider);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_credentials_updated_at 
    BEFORE UPDATE ON public.user_credentials 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
