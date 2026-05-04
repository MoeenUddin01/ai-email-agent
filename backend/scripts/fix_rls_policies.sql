-- Fix RLS policies for custom JWT authentication
-- Run this in Supabase SQL Editor

-- Drop existing RLS policies that use auth.uid()
DROP POLICY IF EXISTS "Users can only see their own data" ON users;
DROP POLICY IF EXISTS "Users can only see their own emails" ON emails;
DROP POLICY IF EXISTS "Users can only see their own drafts" ON ai_drafts;
DROP POLICY IF EXISTS "Users can only see their own sent emails" ON sent_emails;
DROP POLICY IF EXISTS "Users can only see their own feedback" ON feedback;

-- Create new policies that work with custom JWT
-- These policies will check the user_id from the JWT token passed in headers

-- Users table - limited access (usually only for user management)
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (id::text = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id::text = current_setting('app.current_user_id', true));

-- Emails table - user can only see their own emails
CREATE POLICY "Users can view own emails" ON emails
    FOR SELECT USING (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own emails" ON emails
    FOR INSERT WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own emails" ON emails
    FOR UPDATE USING (user_id::text = current_setting('app.current_user_id', true));

-- AI drafts table - user can only see their own drafts (via email relationship)
CREATE POLICY "Users can view own drafts" ON ai_drafts
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM emails e 
        WHERE e.id = ai_drafts.email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

CREATE POLICY "Users can insert own drafts" ON ai_drafts
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM emails e 
        WHERE e.id = email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

CREATE POLICY "Users can update own drafts" ON ai_drafts
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM emails e 
        WHERE e.id = ai_drafts.email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

-- Sent emails table - user can only see their own sent emails (via email relationship)
CREATE POLICY "Users can view own sent emails" ON sent_emails
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM emails e 
        WHERE e.id = sent_emails.email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

CREATE POLICY "Users can insert own sent emails" ON sent_emails
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM emails e 
        WHERE e.id = email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

-- Feedback table - user can only see their own feedback (via sent_emails -> emails relationship)
CREATE POLICY "Users can view own feedback" ON feedback
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM sent_emails se
        JOIN emails e ON e.id = se.email_id
        WHERE se.id = feedback.sent_email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

CREATE POLICY "Users can insert own feedback" ON feedback
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM sent_emails se
        JOIN emails e ON e.id = se.email_id
        WHERE se.id = feedback.sent_email_id 
        AND e.user_id::text = current_setting('app.current_user_id', true)
    ));

-- Knowledge vectors table - read-only for all authenticated users
CREATE POLICY "Authenticated users can view knowledge vectors" ON knowledge_vectors
    FOR SELECT USING (current_setting('app.current_user_id', true) IS NOT NULL);

-- Enable RLS on knowledge_vectors if not already enabled
ALTER TABLE knowledge_vectors ENABLE ROW LEVEL SECURITY;
