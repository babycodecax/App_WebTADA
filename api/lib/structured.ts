import { getSupabase } from './supabase';

// ─── Structured knowledge (cache hot) ───
// Cache tầng module (L8): invalidation qua invalidateStructuredCache() khi có
// upload/ingest — không cần restart server để thấy số liệu mới.

let _structuredCache: { key: string; value: string }[] | null = null;

export async function getStructuredKnowledge(force: boolean = false): Promise<{ key: string; value: string }[]> {
  if (_structuredCache && !force) return _structuredCache;
  const { data } = await getSupabase()
    .from('knowledge_structured')
    .select('key, value');
  _structuredCache = data || [];
  return _structuredCache;
}

export function invalidateStructuredCache(): void {
  _structuredCache = null;
}
