/**
 * libraryData.ts — Logic thuần (pure) cho Thư viện Biểu mẫu & Văn bản Luật.
 *
 * Tách rời khỏi route handler để unit-test trực tiếp bằng node --test
 * (không cần môi trường Next.js, không cần .env — mock Supabase client).
 *
 * - fetchLibrary(): 2 query (landing_forms active + source_documents legal)
 * - validateFormInput() / validateFormUpdate(): validate payload admin
 * - mapFormRow() / mapLegalRow(): shape trả về cho frontend
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Loại văn bản luật được hiển thị trên landing (khớp CHECK constraint của source_documents). */
export const LEGAL_DOC_TYPES = ['luat', 'nd', 'tt', 'nq', 'vbhn'] as const;

/** Cột lấy từ landing_forms cho public API (không lộ nội bộ sort_order/is_active). */
export const FORM_PUBLIC_FIELDS = 'id,name,description,file_name,file_url,file_type,file_size';

/** Cột lấy từ source_documents cho public API. */
export const LEGAL_FIELDS = 'id,title,doc_type,effective_date,file_path';

/** Giới hạn danh sách văn bản luật trả về (trang chủ không cần toàn bộ kho). */
export const LEGAL_MAX_ROWS = 100;

export interface FormPublicRow {
  id: string;
  name: string;
  description: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

export interface LegalPublicRow {
  id: string;
  title: string;
  doc_type: string;
  effective_date: string;
  file_path: string;
}

export interface LibraryResult {
  forms: FormPublicRow[];
  legal_documents: LegalPublicRow[];
  error: string | null;
}

export function mapFormRow(row: Record<string, unknown>): FormPublicRow {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    file_name: String(row.file_name || ''),
    file_url: String(row.file_url || ''),
    file_type: String(row.file_type || ''),
    file_size: typeof row.file_size === 'number' && Number.isFinite(row.file_size) ? row.file_size : 0,
  };
}

export function mapLegalRow(row: Record<string, unknown>): LegalPublicRow {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    doc_type: String(row.doc_type || ''),
    effective_date: String(row.effective_date || ''),
    file_path: String(row.file_path || ''),
  };
}

/** Chạy song song 2 query, map shape, gộp lỗi đầu tiên (nếu có). */
export async function fetchLibrary(sb: SupabaseClient): Promise<LibraryResult> {
  const formsQuery = sb
    .from('landing_forms')
    .select(FORM_PUBLIC_FIELDS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  const legalQuery = sb
    .from('source_documents')
    .select(LEGAL_FIELDS)
    .eq('source_origin', 'vault')
    .eq('status', 'ready')
    .in('doc_type', [...LEGAL_DOC_TYPES])
    .order('updated_at', { ascending: false })
    .limit(LEGAL_MAX_ROWS);

  const [formsRes, legalRes] = await Promise.all([formsQuery, legalQuery]);
  if (formsRes.error) return { forms: [], legal_documents: [], error: formsRes.error.message };
  if (legalRes.error) return { forms: [], legal_documents: [], error: legalRes.error.message };

  return {
    forms: ((formsRes.data || []) as Record<string, unknown>[]).map(mapFormRow),
    legal_documents: ((legalRes.data || []) as Record<string, unknown>[]).map(mapLegalRow),
    error: null,
  };
}

// =========================================================================
// Validate payload admin — fail fast, thông báo tiếng Việt
// =========================================================================

export interface FormInput {
  name: string;
  description: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  file_size: number;
  sort_order: number;
  is_active: boolean;
}

export type ValidateResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NAME_MAX = 300;
const DESC_MAX = 2000;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** POST /api/admin/forms — bắt buộc name + file_url; các trường khác có mặc định. */
export function validateFormInput(body: unknown): ValidateResult<FormInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Thiếu dữ liệu biểu mẫu' };
  }
  const b = body as Record<string, unknown>;

  const name = str(b.name);
  if (!name) return { ok: false, error: 'Thiếu tên biểu mẫu (name)' };
  if (name.length > NAME_MAX) return { ok: false, error: `Tên biểu mẫu quá dài (tối đa ${NAME_MAX} ký tự)` };

  const description = str(b.description);
  if (description.length > DESC_MAX) return { ok: false, error: `Mô tả quá dài (tối đa ${DESC_MAX} ký tự)` };

  const fileUrl = str(b.file_url);
  if (!fileUrl) return { ok: false, error: 'Thiếu file_url — hãy tải file lên Storage trước' };

  const fileSize = typeof b.file_size === 'number' && Number.isFinite(b.file_size) && b.file_size > 0
    ? Math.floor(b.file_size)
    : 0;
  const sortOrder = typeof b.sort_order === 'number' && Number.isFinite(b.sort_order)
    ? Math.floor(b.sort_order)
    : 0;

  return {
    ok: true,
    data: {
      name,
      description,
      file_name: str(b.file_name),
      file_path: str(b.file_path),
      file_url: fileUrl,
      file_type: str(b.file_type),
      file_size: fileSize,
      sort_order: sortOrder,
      is_active: b.is_active !== false,
    },
  };
}

/** PUT /api/admin/forms — bắt buộc id; các trường còn lại tùy chọn (patch từng phần). */
export function validateFormUpdate(body: unknown): ValidateResult<{ id: string; patch: Record<string, unknown> }> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Thiếu dữ liệu cập nhật' };
  }
  const b = body as Record<string, unknown>;

  const id = str(b.id);
  if (!id) return { ok: false, error: 'Thiếu id biểu mẫu' };

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = str(b.name);
    if (!name) return { ok: false, error: 'Tên biểu mẫu không được rỗng' };
    if (name.length > NAME_MAX) return { ok: false, error: `Tên biểu mẫu quá dài (tối đa ${NAME_MAX} ký tự)` };
    patch.name = name;
  }
  if (b.description !== undefined) {
    const description = str(b.description);
    if (description.length > DESC_MAX) return { ok: false, error: `Mô tả quá dài (tối đa ${DESC_MAX} ký tự)` };
    patch.description = description;
  }
  if (b.sort_order !== undefined) {
    if (typeof b.sort_order !== 'number' || !Number.isFinite(b.sort_order)) {
      return { ok: false, error: 'sort_order phải là số' };
    }
    patch.sort_order = Math.floor(b.sort_order);
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { ok: false, error: 'is_active phải là boolean' };
    patch.is_active = b.is_active;
  }
  if (b.file_url !== undefined) patch.file_url = str(b.file_url);
  if (b.file_name !== undefined) patch.file_name = str(b.file_name);
  if (b.file_type !== undefined) patch.file_type = str(b.file_type);
  if (b.file_size !== undefined) {
    if (typeof b.file_size !== 'number' || !Number.isFinite(b.file_size)) {
      return { ok: false, error: 'file_size phải là số' };
    }
    patch.file_size = Math.floor(b.file_size);
  }

  return { ok: true, data: { id, patch } };
}
