import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Escape ky tu dac biet cua LIKE de tranh match sai khi xoa theo contains.
function escLike(s: string): string {
  const bs = String.fromCharCode(92);
  return s.replace(/[%_*~]/g, m => bs + m);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!ADMIN_PASSWORD || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { source, title, mode = 'contains' } = await req.json();
  if (!source && !title) {
    return NextResponse.json({ error: 'Thiếu source hoặc title' }, { status: 400 });
  }

  let query = getSupabase().from('documents').delete({ count: 'exact' });
  if (source) {
    query = mode === 'exact'
      ? query.eq('source', source)
      : query.ilike('source', `*${escLike(source)}*`);
  } else if (title) {
    query = mode === 'exact'
      ? query.eq('title', title)
      : query.ilike('title', `*${escLike(title)}*`);
  }

  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
