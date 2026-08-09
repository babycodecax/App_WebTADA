import { NextRequest, NextResponse } from 'next/server';
import { isAdminGoogle } from '@/lib/adminAuth';

export const runtime = 'nodejs';

/** GET /api/admin/check — kiểm tra ADMIN_PASSWORD hợp lệ trước khi vào tab upload. */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
