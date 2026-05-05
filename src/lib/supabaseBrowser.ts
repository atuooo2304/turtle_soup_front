import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * 浏览器端 Supabase（anon key）。用于 Magic Link / Session。
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anon) {
    throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY');
  }
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(
    String(import.meta.env.VITE_SUPABASE_URL || '').trim() &&
      String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  );
}
