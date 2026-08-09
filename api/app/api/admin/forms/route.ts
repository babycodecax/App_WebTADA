import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';
import { validateFormInput, validateFormUpdate } from '@/lib/libraryData';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Bucket Storage chứa file biểu mẫu (public — người dùng tải trực tiếp qua file_url). */
const BUCKET = 'forms';

/** Vercel body limit ~4.5MB — giữ dưới 4 MB như admin/upload. */
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt', '.md']);

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const ADMIN_FIELDS = 'id,name,description,file_name,file_path,file_url,file_type,file_size,sort_order,is_active,created_at,updated_at';

/** Sanitize tên file Storage: chỉ giữ chữ/số/-, bỏ ký tự đặc biệt, chống path traversal. */
function sanitizeStorageName(name: string): string {
  const base = (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return base || 'form';
}

/** Tạo bucket Storage nếu chưa có (idempotent, best-effort). */
async function ensureBucket(): Promise<void> {
  try {
    await getSupabase().storage.createBucket(BUCKET, { public: true });
  } catch {
    // Bucket đã tồn tại hoặc thiếu quyền — bỏ qua (best-effort)
  }
}

/** Số thứ tự TỰ ĐỘNG: max(sort_order) hiện có + 1 — không cần admin nhập tay. */
async function nextSortOrder(sb: ReturnType<typeof getSupabase>): Promise<number> {
  try {
    const { data, error } = await sb
      .from('landing_forms')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    if (error) return 0;
    const max = (data && data[0] && typeof data[0].sort_order === 'number') ? data[0].sort_order : 0;
    return max + 1;
  } catch {
    return 0;
  }
}

/** Upload file lên Storage bucket 'forms' (public). Trả { storagePath, publicUrl } hoặc throw. */
async function uploadFormFile(file: File, filePath: string, contentType: string): Promise<{ storagePath: string; publicUrl: string }> {
  await ensureBucket();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await getSupabase().storage
    .from(BUCKET)
    .upload(filePath, buf, { contentType, upsert: true });
  if (error) throw new Error(`Upload Storage thất bại: ${error.message}`);

  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = data?.publicUrl || '';
  if (!publicUrl) throw new Error('Không lấy được public URL của file');
  return { storagePath: filePath, publicUrl };
}

/**
 * GET /api/admin/forms — danh sách toàn bộ biểu mẫu (cả active/inactive).
 * Bộ lọc: ?q=<từ khoá name>
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let query = getSupabase()
      .from('landing_forms')
      .select(ADMIN_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    const { data: rows, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let forms = (rows || []) as Record<string, unknown>[];
    if (q) forms = forms.filter((r) => String(r.name || '').toLowerCase().includes(q));

    return NextResponse.json({ forms, total: forms.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy danh sách biểu mẫu: ${msg}` }, { status: 500 });
  }
}

/**
 * POST /api/admin/forms — thêm biểu mẫu.
 *
 * Body có thể là:
 *  a) JSON: { name, description?, file_name?, file_url, file_type?, file_size?, sort_order? }
 *     — file đã upload lên Storage trước (file_url có sẵn).
 *  b) multipart/form-data: file=<file> + name/description/sort_order — route tự
 *     upload file lên bucket 'forms' rồi tạo bản ghi (pattern giống admin/upload).
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminGoogle(req))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('multipart/form-data')) {
      return handleMultipartCreate(req);
    }

    // JSON path
    const body: unknown = await req.json();
    const v = validateFormInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    // Số thứ tự tự động: nếu admin không gửi sort_order (>0) → max+1
    const data = { ...v.data };
    if (!(typeof data.sort_order === 'number' && data.sort_order > 0)) {
      data.sort_order = await nextSortOrder(getSupabase());
    }

    const { data: created, error } = await getSupabase()
      .from('landing_forms')
      .insert(data)
      .select(ADMIN_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, form: created }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi thêm biểu mẫu: ${msg}` }, { status: 500 });
  }
}

/** POST multipart: đọc file + fields, upload Storage, tạo bản ghi landing_forms. */
async function handleMultipartCreate(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Thiếu file upload' }, { status: 400 });
  }
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Chỉ hỗ trợ .pdf, .docx, .doc, .xlsx, .xls, .txt, .md' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 4 MB.` },
      { status: 400 }
    );
  }

  const rawNameField = form.get('name');
  const rawName = typeof rawNameField === 'string' ? rawNameField : '';
  const name = rawName.trim() || file.name.replace(/\.[^.]+$/, '');
  if (!name) return NextResponse.json({ error: 'Thiếu tên biểu mẫu' }, { status: 400 });
  const descField = form.get('description');
  const description = (typeof descField === 'string' ? descField : '').trim();
  // Số thứ tự TỰ ĐỘNG: nếu admin gửi sort_order hợp lệ (>0) thì dùng, ngược lại
  // backend tự tính max(sort_order)+1 — không cần nhập tay.
  const sortField = form.get('sort_order');
  const sortRaw = typeof sortField === 'string' ? sortField : '';
  const sortOrder = /^\d+$/.test(sortRaw) && parseInt(sortRaw, 10) > 0
    ? parseInt(sortRaw, 10)
    : await nextSortOrder(getSupabase());

  const storageKey = `forms/${Date.now()}-${sanitizeStorageName(file.name)}`;
  const { storagePath, publicUrl } = await uploadFormFile(file, storageKey, MIME_MAP[ext] || 'application/octet-stream');

  // Nếu có field `id` → SỬA biểu mẫu đã chọn (thay file + cập nhật), không tạo mới.
  const idField = form.get('id');
  const editId = typeof idField === 'string' && idField.trim() ? idField.trim() : '';

  const payload = {
    name,
    description,
    file_name: file.name,
    file_path: storagePath,
    file_url: publicUrl,
    file_type: MIME_MAP[ext] || 'application/octet-stream',
    file_size: file.size,
    sort_order: sortOrder,
    is_active: true,
  };

  if (editId) {
    const { data: updated, error: upErr } = await getSupabase()
      .from('landing_forms')
      .update(payload)
      .eq('id', editId)
      .select(ADMIN_FIELDS)
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, form: updated }, { status: 200 });
  }

  const { data: created, error } = await getSupabase()
    .from('landing_forms')
    .insert(payload)
    .select(ADMIN_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, form: created }, { status: 201 });
}

/**
 * PUT /api/admin/forms — sửa biểu mẫu (patch từng phần).
 * Body JSON: { id, name?, description?, sort_order?, is_active?, file_url? }
 */
export async function PUT(req: NextRequest) {
  if (!(await isAdminGoogle(req))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body: unknown = await req.json();
    const v = validateFormUpdate(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const { data: updated, error } = await getSupabase()
      .from('landing_forms')
      .update({ ...v.data.patch, updated_at: new Date().toISOString() })
      .eq('id', v.data.id)
      .select(ADMIN_FIELDS)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy biểu mẫu' }, { status: 404 });
    return NextResponse.json({ ok: true, form: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi cập nhật biểu mẫu: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/forms?id=... — xóa biểu mẫu (kèm file trong Storage, best-effort).
 */
export async function DELETE(req: NextRequest) {
  if (!(await isAdminGoogle(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
  try {
    const { data: existing, error: findError } = await getSupabase()
      .from('landing_forms')
      .select('file_path')
      .eq('id', id)
      .limit(1)
      .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Không tìm thấy biểu mẫu' }, { status: 404 });

    const { error } = await getSupabase().from('landing_forms').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Xóa file Storage (best-effort — không chặn xóa bản ghi)
    const storagePath = (existing as { file_path?: string }).file_path || '';
    if (storagePath) {
      try {
        await getSupabase().storage.from(BUCKET).remove([storagePath]);
      } catch {
        // File không xóa được không chặn xóa biểu mẫu
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xóa biểu mẫu: ${msg}` }, { status: 500 });
  }
}
