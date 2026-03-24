// ==========================================================
// FILE: src/lib/supabase.ts
// PURPOSE: Creates the Supabase client connections for Cactus.
//
// TWO CLIENTS — why?
// - supabase (anon client): used by the Cactus Portal frontend.
//   Respects RLS policies — users only see their own org's data.
// - supabaseAdmin (service role client): used by the backend
//   API only. Bypasses RLS for full database access.
//   NEVER expose the admin client to the browser.
// ==========================================================

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Validate that required environment variables exist.
// If they're missing, crash immediately with a clear error
// rather than failing silently later with a confusing message.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: SUPABASE_ANON_KEY');
}
if (!supabaseServiceRoleKey) {
  throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
}

// The anon client — safe for frontend use, RLS enforced
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// The admin client — backend only, bypasses RLS
// NEVER import this in any frontend or portal code
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);