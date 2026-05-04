import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ggaguxnxeilsdxdfxgvc.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7MYD9ciwgocQAMa9XFm55w_NaruIpN3'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
