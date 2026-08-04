-- 2026-08-04 source-documents-storage-path.sql
-- Thêm cột storage_path: đường dẫn file word gốc (.docx) trong Supabase Storage.
-- Khi admin xem/tải nguồn vault → đọc file .docx gốc từ Storage thay vì chunks md.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)

ALTER TABLE source_documents ADD COLUMN IF NOT EXISTS storage_path TEXT DEFAULT '';
