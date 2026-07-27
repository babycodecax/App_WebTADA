import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/claude';
import mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

async function extractFile(file: File): Promise<string> {
  if (file.name.endsWith('.docx')) {
    const buf = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value || '';
  }
  return await file.text();
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!ADMIN_PASSWORD || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const title = (form.get('title') as string) || (file?.name.replace(/\.(docx|txt|md)$/i, '') ?? '') || '';
  const tag = (form.get('tag') as string) || 'tax';

  if (!file || !title) {
    return NextResponse.json({ error: 'Missing file or title' }, { status: 400 });
  }

  const content = await extractFile(file);
  if (!content.trim()) {
    return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
  }

  const sourceHash = hash(content.slice(0, 500));
  const source = `upload/${title}-${sourceHash.slice(0, 8)}`;
  const chunks = chunkText(content);

  // Dedupe neu upload lai cung file.
  const { data: existing } = await getSupabase()
    .from('documents')
    .select('chunk_index')
    .eq('source', source);
  const done = new Set((existing || []).map((r: any) => r.chunk_index));

  const records = [];
  for (let i = 0; i < chunks.length; i++) {
    if (done.has(i)) continue;
    const embedding = await embedText(chunks[i]);
    records.push({
      content: chunks[i], title, source, tag, chunk_index: i, source_hash: sourceHash, embedding,
    });
  }

  if (records.length) {
    const { error } = await getSupabase().from('documents').insert(records);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chunks: records.length, source });
}
