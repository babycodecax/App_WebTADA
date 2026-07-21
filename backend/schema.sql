-- Schema cho Obsidian RAG Chatbox (BM25 + Supabase)
-- Chạy trên SQL Editor của Supabase project (free tier).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path TEXT UNIQUE,
    title TEXT,
    content TEXT,
    chunks JSONB,           -- Mảng các đoạn text đã cắt nhỏ: [{"text": "..."}, ...]
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index phụ để truy vấn theo file_path nhanh (UPSERT on_conflict).
CREATE INDEX IF NOT EXISTS documents_file_path_idx ON documents (file_path);
