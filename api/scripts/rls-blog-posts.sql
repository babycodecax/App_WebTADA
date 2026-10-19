-- rls-blog-posts.sql — Bật RLS bảng blog_posts (chạy 1 lần trong Supabase Dashboard → SQL Editor)
--
-- Mục tiêu: anon key (public, nằm trong /api/config) hiện PATCH/UPDATE được blog_posts
-- (verified live: PATCH bằng anon key trả 204). Sau khi bật RLS:
--   + anon/authenticated chỉ SELECT được bài status='published'
--   + mọi INSERT/UPDATE/DELETE bằng anon key đều bị chặn
--   + service-role key (SSR, admin API, backfill, prebuild) vẫn bypass RLS — không ảnh hưởng web
--
-- Verify sau khi chạy (chạy lại probe PATCH cùng giá trị → phải 403):
--   PATCH /rest/v1/blog_posts?slug=eq.<slug-thật> với anon key, summary=giá-trị-hiện-tại
--   → 403 RLS là ĐÚNG; 204 nghĩa là RLS chưa được áp dụng.

alter table public.blog_posts enable row level security;

drop policy if exists "anon_read_published_posts" on public.blog_posts;
create policy "anon_read_published_posts"
  on public.blog_posts
  for select
  to anon, authenticated
  using (status = 'published');

-- Không tạo policy ghi: mặc định deny toàn bộ INSERT/UPDATE/DELETE cho anon/authenticated.
-- Admin ghi được bài thông qua API server-side (dùng service-role key bypass RLS).
