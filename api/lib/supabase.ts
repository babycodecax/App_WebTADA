import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false },
      // Chống Next.js patch-fetch cache (Full Route Cache) — nếu không, GET
      // Supabase REST trùng URL sẽ bị cache response cũ (nội dung admin mới
      // KHÔNG hiện). Chỉ ảnh hưởng server, an toàn.
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) },
    });
  }
  return _client;
}

export const EMBED_DIM = 1536; // text-embedding-3-small
