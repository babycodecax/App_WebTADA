import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Cột group_name của hàng sentinel chứa toàn bộ nội dung văn bản dịch vụ. */
const SERVICES_CONTENT_ROW = '__services_content__';

/**
 * Khóa cố định của hàng sentinel (PK — atomic upsert chống duplicate khi 2 admin lưu cùng lúc).
 * Migration 006_landing_services.sql cập nhật hàng sentinel có group_name = __services_content__
 * để có id này (id cố định, không đổi).
 */
const SERVICES_CONTENT_ID = '00000000-0000-4000-8000-0000000000aa';

/** Giới hạn độ dài nội dung dịch vụ (ký tự) — chống payload quá lớn. */
const SERVICES_CONTENT_MAX = 50000;

/**
 * GET /api/admin/services — nội dung dịch vụ hiện tại (admin auth bắt buộc).
 *
 * Trả về toàn bộ nội dung trong hàng sentinel:
 * {
 *   "content": "🏠 Kế toán dịch vụ trọn gói\n🏠 Thành lập & Giải thể Doanh nghiệp\n..."
 * }
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const { data: row, error } = await getSupabase()
      .from('landing_services')
      .select('description')
      .eq('group_name', SERVICES_CONTENT_ROW)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ content: row?.description || '' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy nội dung dịch vụ: ${msg}` }, { status: 500 });
  }
}

/**
 * POST /api/admin/services — lưu toàn bộ nội dung dịch vụ (upsert hàng sentinel).
 * Body: { "content": "dòng 1\ndòng 2\n..." } — mỗi dòng 1 dịch vụ, admin tự viết emoji.
 * Admin auth bắt buộc.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const body: unknown = await req.json();
    const content = typeof body === 'object' && body !== null && typeof (body as { content?: unknown }).content === 'string'
      ? (body as { content: string }).content
      : null;

    if (content === null) {
      return NextResponse.json({ error: 'Thiếu nội dung dịch vụ (content)' }, { status: 400 });
    }
    if (content.length > SERVICES_CONTENT_MAX) {
      return NextResponse.json(
        { error: `Nội dung dịch vụ quá dài (tối đa ${SERVICES_CONTENT_MAX} ký tự)` },
        { status: 400 }
      );
    }

    // Upsert atomic theo PK cố định — không read-then-write, chống duplicate khi 2 admin lưu cùng lúc.
    const { error: upsertError } = await getSupabase()
      .from('landing_services')
      .upsert(
        {
          id: SERVICES_CONTENT_ID,
          group_name: SERVICES_CONTENT_ROW,
          group_emoji: '',
          sort_order: 0,
          name: SERVICES_CONTENT_ROW,
          description: content,
          is_active: true,
        },
        { onConflict: 'id' }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lưu nội dung dịch vụ: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/services?id=... — xóa hàng sentinel (admin auth bắt buộc).
 * Chỉ cho phép xóa chính hàng sentinel __services_content__ (id tương ứng);
 * các hàng dịch vụ cũ từ giao diện cũ không còn quản lý nữa.
 */
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
  }
  try {
    const { data: row, error: findError } = await getSupabase()
      .from('landing_services')
      .select('group_name')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    if (!row || row.group_name !== SERVICES_CONTENT_ROW) {
      return NextResponse.json({ error: 'Không tìm thấy nội dung dịch vụ' }, { status: 404 });
    }

    const { error } = await getSupabase().from('landing_services').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xóa nội dung dịch vụ: ${msg}` }, { status: 500 });
  }
}