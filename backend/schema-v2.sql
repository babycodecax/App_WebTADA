-- schema-v2.sql: Cho kiến trúc Vercel (pgvector + hybrid search)
-- Chạy trong Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- 1) Bảng chunks tri thức (thay thế documents cũ)
-- ==========================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    title TEXT DEFAULT '',
    heading TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    chunk_index INTEGER DEFAULT 0,
    embedding vector(768),            -- Gemini text-embedding-004
    source_hash TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Vector index (IVFFlat, 100 lists)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Full-text search
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
    ON knowledge_chunks
    USING gin(fts);

-- ==========================================
-- 2) Answer cache
-- ==========================================
CREATE TABLE IF NOT EXISTS answer_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_hash TEXT UNIQUE NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources_json JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_answer_cache_hash ON answer_cache (question_hash);

-- ==========================================
-- 3) Bảng structured knowledge
-- ==========================================
CREATE TABLE IF NOT EXISTS knowledge_structured (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 4) Vector search function
-- ==========================================
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.6,
    match_count int DEFAULT 30
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    title TEXT,
    heading TEXT,
    file_path TEXT,
    chunk_index INTEGER,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.content,
        kc.title,
        kc.heading,
        kc.file_path,
        kc.chunk_index,
        1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    WHERE 1 - (kc.embedding <=> query_embedding) > match_threshold
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
