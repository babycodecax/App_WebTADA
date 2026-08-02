-- 2026-08-02 source-documents.sql
-- Bảng source_documents: kho quản lý các nguồn tài liệu tri thức.
--   - nguồn vault: file .md luật trong vault/thue-ke-toan/ (42-44 file)
--   - nguồn upload: tài liệu admin upload qua web (prefix "upload/")
--
-- Mỗi nguồn theo dõi trạng thái extract (ready/processing/error) để
-- chatbox biết kiến thức compliance đã sẵn sàng hay chưa.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py  (cần SUPABASE_PSQL trong .env)

-- Lưu ý (fix LOW): dùng gen_random_uuid() (có sẵn trong Supabase qua
-- pgcrypto, bật mặc định) thay vì uuid_generate_v4() (cần uuid-ossp phải
-- cài extension trước — nếu thiếu, CREATE TABLE fail 42P01 → mọi thao tác
-- source_documents trả 500). Không cần CREATE EXTENSION thủ công.
CREATE TABLE IF NOT EXISTS source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'other'
        CHECK (doc_type IN ('luat', 'nd', 'tt', 'nq', 'vbhn', 'other')),
    effective_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('ready', 'processing', 'error')),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    source_origin TEXT NOT NULL DEFAULT 'vault'
        CHECK (source_origin IN ('vault', 'upload')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index phụ: lọc nhanh theo loại văn bản / trạng thái / nguồn gốc.
CREATE INDEX IF NOT EXISTS source_documents_doc_type_idx
    ON source_documents (doc_type);
CREATE INDEX IF NOT EXISTS source_documents_status_idx
    ON source_documents (status);
CREATE INDEX IF NOT EXISTS source_documents_source_origin_idx
    ON source_documents (source_origin);

-- Xác nhận: SELECT conname FROM pg_constraint WHERE conname = 'source_documents_file_path_key';
