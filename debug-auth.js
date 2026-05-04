// Debug script to test Supabase auth
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ggaguxnxeilsdxdfxgvc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnYWd1eG54ZWlsc2R4ZGZ4Z3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2OTAwNjIsImV4cCI6MjA5MzI2NjA2Mn0.WLEZ5NEVODekAoYyVrLIKTz69iEtNfKIRnfV4-pZ830';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSupabaseAuth() {
  console.log('Testing Supabase connection...');
  
  try {
    // Test basic connection
    const { data, error } = await supabase.auth.getConfiguration();
    
    if (error) {
      console.error('Error getting Supabase config:', error);
    } else {
      console.log('Supabase config:', JSON.stringify(data, null, 2));
    }
    
    // Test Google OAuth specifically
    console.log('\nTesting Google OAuth...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback'
      }
    });
    
    if (signInError) {
      console.error('Google OAuth error:', signInError);
    } else {
      console.log('Google OAuth URL:', signInData.url);
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testSupabaseAuth();
