-- rls-blog-posts.sql — Siết RLS bảng blog_posts (chạy 1 lần trong Supabase Dashboard → SQL Editor)
--
-- XUẤT PHÁT THỰC TẾ (19/10/2026): bảng ĐÃ bật RLS từ trước nhưng có 4 policy
-- "public" không điều kiện (blog_posts_select/_insert/_update/_delete) cho phép
-- anon làm mọi thứ → patched 19/10: xoá 4 policy cũ, giữ policy đọc published.
--
-- Sau khi chạy:
--   + anon/authenticated chỉ SELECT được bài status='published' (bài nháp ẩn)
--   + INSERT anon → lỗi 403/42501 "new row violates row-level security policy"
--   + UPDATE/DELETE anon → Postgres lặng lẽ cập nhật 0 dòng (data không đổi),
--     không có HTTP error — verify bằng cách đọc lại qua service key
--   + service-role key (SSR, admin API, backfill, prebuild) bypass RLS — không ảnh hưởng web
--
-- Verify sau khi chạy (đã verified 19/10/2026):
--   1. GET  /rest/v1/blog_posts?status=eq.draft với anon key  → []  (bài nháp ẩn)
--   2. PATCH /rest/v1/blog_posts?slug=eq.<slug> đổi summary sang giá trị khác
--      với anon key → HTTP 200/204 nhưng body [], đọc lại bằng service key
--      → summary KHÔNG ĐỔI (RLS chặn lặng lẽ)
--   3. POST /rest/v1/blog_posts với anon key → 403 code 42501
--   4. anon đếm bài = số published; service key đếm = tổng (âm phần là nháp)

-- 1) Xoá 4 policy public cũ cho phép mọi thứ (đã tồn tại từ trước)
drop policy if exists blog_posts_select on public.blog_posts;
drop policy if exists blog_posts_insert on public.blog_posts;
drop policy if exists blog_posts_update on public.blog_posts;
drop policy if exists blog_posts_delete on public.blog_posts;

-- 2) Bật RLS + policy đọc hàng published duy nhất
alter table public.blog_posts enable row level security;

drop policy if exists "anon_read_published_posts" on public.blog_posts;
create policy "anon_read_published_posts"
  on public.blog_posts
  for select
  to anon, authenticated
  using (status = 'published');

-- Không tạo policy ghi: mặc định deny toàn bộ INSERT/UPDATE/DELETE cho anon/authenticated.
-- Admin ghi được bài thông qua API server-side (dùng service-role key bypass RLS).
