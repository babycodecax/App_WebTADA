import { NextResponse } from 'next/server';
import { listCachedResults } from '@/lib/audit/cache';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const results = listCachedResults();
    return NextResponse.json({ results, count: results.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Audit history error:', msg);
    return NextResponse.json({ error: msg, results: [], count: 0 }, { status: 500 });
  }
}
