-- schema-blog.sql: Bảng blog_posts + RLS
-- Chạy trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT NOT NULL,
    status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published')),
    published_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    author_email TEXT DEFAULT '',
    author_name TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (status, published_at DESC);

-- RLS: chỉ admin INSERT/UPDATE/DELETE, mọi người SELECT
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Admin check: những email trong list này mới được ghi
CREATE POLICY blog_posts_select ON blog_posts FOR SELECT USING (true);
CREATE POLICY blog_posts_insert ON blog_posts FOR INSERT
    WITH CHECK (author_email = current_setting('request.jwt.claims')::json->>'email');
CREATE POLICY blog_posts_update ON blog_posts FOR UPDATE
    USING (author_email = current_setting('request.jwt.claims')::json->>'email');
CREATE POLICY blog_posts_delete ON blog_posts FOR DELETE
    USING (author_email = current_setting('request.jwt.claims')::json->>'email');
