-- Chạy trong SQL Editor của Supabase (pgvector)
-- 1. Enable extension
create extension if not exists vector;

-- 2. Bảng documents (knowledge chunks)
create table if not exists public.documents (
  id bigserial primary key,
  content text not null,
  title text,
  source text,
  tag text,
  chunk_index int default 0,
  source_hash text,
  embedding vector(3072),
  created_at timestamptz default now()
);

-- 3. Index để search nhanh
create index if not exists documents_embedding_idx
  on public.documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. RPC semantic search
create or replace function match_documents (
  query_embedding vector(3072),
  match_threshold float default 0.78,
  match_count int default 5
)
returns table (
  id bigint, content text, title text, source text, tag text,
  similarity float
)
language sql
as $$
  select
    id, content, title, source, tag,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. RLS: cho phép đọc públic (chỉ search), ghi chỉ qua service_role
alter table public.documents enable row level security;
create policy "Public read" on public.documents for select using (true);
