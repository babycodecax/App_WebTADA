import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';

/** GET /api/admin/check — kiểm tra ADMIN_PASSWORD hợp lệ trước khi vào tab upload. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
