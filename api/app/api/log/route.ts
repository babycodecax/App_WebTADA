import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/log — ghi activity log (best-effort).
 *
 * BẢO MẬT (fix review 2026-08-10):
 *  - BẮT BUỘC đăng nhập: Bearer access_token Google hợp lệ; email LẤY TỪ
 *    SERVER (getUser) — không tin field email client gửi.
 *  - Whitelist fields + giới hạn độ dài (chống spam/đổ rác vào activity_logs).
 *  - Rate limit nhẹ theo IP (60 req/phút) — chống spam endpoint lén.
 */
const FIELD_LIMITS = {
  user_name: 100,
  action: 50,
  detail: 500,
  question_count: 10000,
} as const;

// Rate limit in-memory theo IP (60/phút — chỉ chặn spam, không ảnh hưởng bot thật)
const RATE = { windowMs: 60 * 1000, max: 60 };
const _rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE.windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= RATE.max;
}

export async function POST(req: NextRequest) {
  try {
    // 1) Bắt buộc đăng nhập — email lấy từ token, không từ body
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = auth.slice(7).trim();
    if (!token) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: userData, error: userError } = await getSupabase().auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const email = userData.user.email.toLowerCase();

    // 2) Rate limit nhẹ
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // 3) Whitelist + giới hạn độ dài — bỏ mọi field không cần thiết
    const body: unknown = await req.json().catch(() => null);
    const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const user_name = str(b.user_name).slice(0, FIELD_LIMITS.user_name);
    const action = str(b.action).slice(0, FIELD_LIMITS.action);
    const detail = str(b.detail).slice(0, FIELD_LIMITS.detail);
    const question_count =
      typeof b.question_count === 'number' && Number.isFinite(b.question_count)
        ? Math.max(0, Math.min(Math.floor(b.question_count), FIELD_LIMITS.question_count))
        : 0;

    await getSupabase()
      .from('activity_logs')
      .insert({ email, user_name, action, detail, question_count })
      .maybeSingle();

    return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Best-effort — lỗi log không bao giờ làm hỏng trải nghiệm chat
    return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
  }
}