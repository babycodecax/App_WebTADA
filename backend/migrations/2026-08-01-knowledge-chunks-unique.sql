-- 2026-08-01-knowledge-chunks-unique.sql
-- Fix C1 (CRITICAL): upsert onConflict 'file_path,chunk_index' fail 42P10
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- vì bảng knowledge_chunks không có UNIQUE constraint nào trên (file_path, chunk_index).
--
-- Đã kiểm tra DB thật ngày 2026-08-01: 0 duplicate (file_path, chunk_index)
-- trên 1579 chunks → chạy trực tiếp an toàn.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py

-- Dọn duplicate nếu có (an toàn hơn) — xoá bản cũ nhất, giữ bản mới nhất.
DELETE FROM knowledge_chunks a
USING knowledge_chunks b
WHERE a.ctid < b.ctid
  AND a.file_path IS NOT DISTINCT FROM b.file_path
  AND a.chunk_index IS NOT DISTINCT FROM b.chunk_index;

-- Constraint UNIQUE — bắt buộc cho mọi upsert onConflict ở 3 code path:
--   api/app/api/admin/upload/route.ts, api/app/api/admin/ingest/route.ts,
--   backend/upload_routes.py
ALTER TABLE knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_file_path_chunk_index_key
    UNIQUE (file_path, chunk_index);

-- Xác nhận: SELECT conname FROM pg_constraint WHERE conname = 'knowledge_chunks_file_path_chunk_index_key';
