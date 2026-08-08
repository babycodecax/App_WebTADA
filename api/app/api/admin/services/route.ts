import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ServiceInput {
  id?: string;
  group_name?: unknown;
  group_emoji?: unknown;
  sort_order?: unknown;
  name?: unknown;
  description?: unknown;
  features?: unknown;
  is_active?: unknown;
}

/** Chuẩn hóa + kiểm tra dữ liệu dịch vụ từ body. Trả null nếu thiếu trường bắt buộc. */
function parseServiceInput(body: ServiceInput): Record<string, unknown> | null {
  const groupName = typeof body.group_name === 'string' ? body.group_name.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!groupName || !name) return null;

  const features = Array.isArray(body.features)
    ? body.features.filter((f: unknown) => typeof f === 'string').map((f: string) => f.trim()).filter(Boolean).slice(0, 12)
    : [];

  const sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? Math.max(0, Math.floor(body.sort_order))
    : 0;

  return {
    group_name: groupName,
    group_emoji: typeof body.group_emoji === 'string' ? body.group_emoji.trim() : '',
    name,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    features,
    sort_order: sortOrder,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
  };
}

/**
 * GET /api/admin/services — toàn bộ dịch vụ (kể cả ẩn), theo group_name + sort_order.
 * Dùng cho admin page hiển thị danh sách chỉnh sửa.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const { data: rows, error } = await getSupabase()
      .from('landing_services')
      .select('*')
      .order('group_name', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ services: rows || [], total: (rows || []).length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy danh sách dịch vụ: ${msg}` }, { status: 500 });
  }
}

/**
 * POST /api/admin/services — tạo mới hoặc cập nhật (upsert theo body.id).
 * Nếu có id → UPDATE; không có id → INSERT. Admin auth bắt buộc.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const body: ServiceInput = await req.json();
    const row = parseServiceInput(body);
    if (!row) {
      return NextResponse.json({ error: 'Thiếu group_name hoặc name' }, { status: 400 });
    }

    if (typeof body.id === 'string' && body.id.trim()) {
      const { data, error } = await getSupabase()
        .from('landing_services')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', body.id.trim())
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Dịch vụ không tồn tại' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, service: data });
    }

    const { data, error } = await getSupabase()
      .from('landing_services')
      .insert(row)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, service: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lưu dịch vụ: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/services?id=... — xóa dịch vụ. Admin auth bắt buộc.
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
    const { error } = await getSupabase().from('landing_services').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xóa dịch vụ: ${msg}` }, { status: 500 });
  }
}