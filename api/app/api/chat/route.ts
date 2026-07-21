import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy — forward request to obsidian-chatbot (Python FastAPI / BM25 + OpenRouter).
 *
 * Format khớp với chatbox.js: { question, top_k } → SSE stream.
 * Không còn dùng embedding / Claude trực tiếp — obsidian-chatbot là single RAG backend.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const BACKEND_URL = process.env.RAG_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    const backendResp = await fetch(`${BACKEND_URL.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: body.question,
        top_k: body.top_k ?? 5,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!backendResp.ok) {
      const err = await backendResp.text().catch(() => 'Unknown error');
      return NextResponse.json({ error: `Backend ${backendResp.status}: ${err.slice(0, 300)}` }, { status: 502 });
    }

    // Forward SSE stream nguyên trạng
    return new Response(backendResp.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    console.error('Chat proxy error:', e);
    return NextResponse.json({ error: e.message || 'Proxy error' }, { status: 500 });
  }
}
