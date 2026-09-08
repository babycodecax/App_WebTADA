import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const cssPath = join(process.cwd(), 'public', 'css', 'blog.css');
    const css = readFileSync(cssPath, 'utf-8');
    return new Response(css, {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response('/* CSS not found */', { status: 404 });
  }
}
