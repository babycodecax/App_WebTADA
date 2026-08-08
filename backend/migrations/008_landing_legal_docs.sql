-- 2026-08-08 landing-legal-docs.sql
-- Bảng landing_legal_docs: toàn văn văn bản luật (HTML giữ bảng biểu như bản Word gốc)
-- hiển thị trong Thư viện trang riêng (/thu-vien).
--   - Lần đầu: script scripts/ingest-legal-docs.ts parse 41 file .docx từ
--     D:\VB luật\Kế toán, thuế (mammoth convertToHtml → giữ bảng) rồi upsert.
--   - Sau này: admin upload nguồn .docx qua admin → hook trong
--     /api/admin/upload tự parse và upsert (không cần thao tác thủ công).
--   - file_name = tên file gốc (.docx) — dùng làm khóa upsert (onConflict) chống trùng.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)
--   LƯU Ý: chạy lại file này là an toàn (idempotent) — không đè dữ liệu đã có.

CREATE TABLE IF NOT EXISTS landing_legal_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'other',
    doc_number TEXT NOT NULL DEFAULT '',
    file_html TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Khóa upsert theo tên file gốc (chống trùng khi chạy lại script / admin upload lại)
CREATE UNIQUE INDEX IF NOT EXISTS landing_legal_docs_file_name_key
    ON landing_legal_docs (file_name);

CREATE INDEX IF NOT EXISTS landing_legal_docs_active_sort_idx
    ON landing_legal_docs (is_active, doc_type, sort_order);

CREATE INDEX IF NOT EXISTS landing_legal_docs_active_created_idx
    ON landing_legal_docs (is_active, created_at DESC);
