import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://eguwujzkvtoovqwenexi.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY 
  ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY 
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXd1anprdnRvb3Zxd2VuZXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTY5ODAsImV4cCI6MjA5MTA3Mjk4MH0.qgjyhteWHJ1zRAdJTjfjQQjpxHlrbirAiUwusIeeu6A';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
