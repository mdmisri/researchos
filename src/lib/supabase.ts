import { createClient } from "@supabase/supabase-js";

// Two clients with different privilege levels — never mix them up.
//
// browserClient: uses the anon key. Safe to expose in the browser.
//   Subject to Row Level Security (RLS) policies in Supabase.
//
// serverClient: uses the service role key. SERVER ONLY — never send to browser.
//   Bypasses RLS entirely. Used for RAG writes that need elevated access.

export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars missing");
  return createClient(url, key);
}

export function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role env vars missing");
  return createClient(url, key);
}
