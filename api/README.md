# TADA AI Chatbox — Hướng dẫn triển khai

## 1. Chuẩn bị Supabase
1. Tạo project tại supabase.com
2. Mở SQL Editor → chạy file `api/supabase-schema.sql`
3. Lấy: Project URL, service_role key (Settings → API)

## 2. Cài đặt biến môi trường (Vercel)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENROUTER_API_KEY (openrouter.ai — 1 key duy nhất, free tier)
- ADMIN_PASSWORD (mật khẩu trang admin)
- CHAT_MODEL (tùy chọn, mặc định anthropic/claude-3.5-sonnet)
- EMBED_MODEL (tùy chọn, mặc định openai/text-embedding-3-small — phải 1536 dim)

> Free: đổi CHAT_MODEL thành slug `:free` (vd: meta-llama/llama-3.1-8b-instruct:free).
> Lưu ý: embedding free hiếm trên OpenRouter; text-embedding-3-small rẻ, dim 1536 khớp pgvector.

## 3. Deploy backend (folder api/) lên Vercel
- Vercel → New Project → import repo → Root Directory: `api`
- Framework preset: Next.js
- Thêm env vars ở bước 2
- Deploy

## 4. Ingest kiến thức từ vault
Cách A — script tự động:
```
cd api
npm install
VAULT_DIR="D:/CodeApp/Projects/App_WebTADA/vault/thue-ke-toan" \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
npm run ingest
```
Cách B — trang admin:
- Truy cập https://<your-app>/admin.html
- Nhập ADMIN_PASSWORD, dán/tải file .md, bấm Ingest

## 5. Kết nối chatbox site tĩnh
- Nếu site tĩnh deploy cùng domain Vercel: để `API_URL = ''` trong `js/chatbox.js`
- Nếu khác domain: sửa `API_URL = 'https://<api-app>.vercel.app'`

## 6. Cập nhật kiến thức sau này
Chỉ cần chạy lại script ingest hoặc upload qua /admin.html.
Không cần deploy lại code. Không cần bật máy tính 24/7.

## Lưu ý
- Vercel Hobby: timeout 10s (có thể thiếu với RAG nặng) → dùng Pro (60s) hoặc streaming.
- Model chat/embedding qua OpenRouter (1 key): đặt CHAT_MODEL / EMBED_MODEL trong env.
- Embedding phải 1536 dim để khớp cột pgvector (text-embedding-3-small).
