#!/usr/bin/env python3

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get Supabase credentials
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

if not supabase_url or not supabase_key:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    exit(1)

# Initialize Supabase client
supabase = create_client(supabase_url, supabase_key)

# SQL to create gmail_credentials table
sql = """
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
"""

try:
    # Execute the SQL using raw SQL execution
    result = supabase.rpc('exec_sql', {'sql': sql}).execute()
    print("Table created successfully!")
except Exception as e:
    print(f"Error creating table: {e}")
    print("Trying alternative approach...")
    
    # Try using the _admin client for raw SQL
    try:
        admin_supabase = create_client(supabase_url, supabase_key)
        # This might not work with all Supabase setups
        response = admin_supabase.table('_temp').select('*').execute()
    except:
        pass
    
    print("Please manually run the SQL in your Supabase dashboard:")
    print("=" * 50)
    print(sql)
    print("=" * 50)
