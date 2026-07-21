-- Reset bảng documents cho Obsidian RAG Chatbox
-- Chạy TOÀN BỘ trên Supabase SQL Editor (xóa bảng cũ sai cấu trúc, tạo lại đúng).

DROP TABLE IF EXISTS documents;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path TEXT UNIQUE,
    title TEXT,
    content TEXT,
    chunks JSONB,           -- Mảng các đoạn text: [{"text": "..."}, ...]
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_file_path_idx ON documents (file_path);

-- Refresh PostgREST schema cache (tránh lỗi PGRST204)
NOTIFY pgrst, 'reload schema';
