-- 2026-08-08 landing-forms.sql
-- Bảng landing_forms: biểu mẫu tải xuống hiển thị trên landing page (admin thêm thủ công).
--   - Landing page (index.html) render danh sách biểu mẫu từ /api/library (tab "Biểu mẫu").
--   - Admin thêm/sửa/xóa qua /api/admin/forms (tab "Thư viện biểu mẫu").
--   - File PDF/DOCX upload lên Supabase Storage bucket 'forms' (public),
--     file_url là URL công khai để người dùng tải xuống.
--   - Văn bản luật KHÔNG nằm ở bảng này — đọc trực tiếp từ source_documents hiện có.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)
--   LƯU Ý: chạy lại file này là an toàn (idempotent) — không đè dữ liệu admin đã lưu.

CREATE TABLE IF NOT EXISTS landing_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
    file_url TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS landing_forms_active_sort_idx
    ON landing_forms (is_active, sort_order);

-- ============================================================
-- STORAGE BUCKET 'forms' (làm bằng tay trên Dashboard, hoặc chạy các lệnh sau):
-- ============================================================
-- 1) Tạo bucket public:
--    insert into storage.buckets (id, name, public)
--    values ('forms', 'forms', true)
--    on conflict (id) do nothing;
--
-- 2) Policy — SELECT cho mọi người (file public, phục vụ nút tải trên landing):
--    create policy "forms_public_select" on storage.objects
--      for select using (bucket_id = 'forms');
--
-- 3) Policy — INSERT/UPDATE/DELETE chỉ cho admin (authenticated):
--    create policy "forms_admin_insert" on storage.objects
--      for insert to authenticated with check (bucket_id = 'forms');
--    create policy "forms_admin_update" on storage.objects
--      for update to authenticated using (bucket_id = 'forms');
--    create policy "forms_admin_delete" on storage.objects
--      for delete to authenticated using (bucket_id = 'forms');
--
-- (Tạo bucket có thể làm bằng tay: Storage → New bucket → tên 'forms' → Public.)
