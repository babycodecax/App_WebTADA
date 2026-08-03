-- 2026-08-03 source-status-deleted.sql
-- Cho phép status='deleted' trong source_documents (soft-delete nguồn qua admin).
--
-- Bối cảnh: xóa nguồn vault qua admin KHÔNG xóa row source_documents mà set
-- status='deleted' — để (a) nguồn đã xóa không bị re-ingest khi chạy lại
-- scripts/ingest-vault.js / backend ingest, (b) admin còn thấy + khôi phục được.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)

ALTER TABLE source_documents DROP CONSTRAINT IF EXISTS source_documents_status_check;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_status_check
  CHECK (status IN ('ready', 'processing', 'error', 'deleted'));

-- Xác nhận: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname = 'source_documents_status_check';
