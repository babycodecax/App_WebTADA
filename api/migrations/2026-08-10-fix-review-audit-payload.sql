-- Migration 2026-08-10-fix-review-audit-payload.sql
-- Mục đích: tạo bảng audit_history (nếu chưa có) + thêm cột payload jsonb
-- để lưu toàn bộ kết quả audit (violations + html_report + word_report) —
-- phục vụ fallback khi cache in-memory trên Vercel serverless bị lạnh
-- (fix review 2026-08-10).
--
-- CÁC CỘT KHỚP VỚI CODE:
--  - api/app/api/audit/upload/route.ts  (saveAuditHistory insert)
--  - api/app/api/audit/history/route.ts (select audit_id, company_name,
--    total_violations, by_severity, ran_at)
--  - api/app/api/audit/result/[id]/route.ts (select payload where audit_id = ?)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS —
-- chạy nhiều lần an toàn.

-- 1) Tạo bảng nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS audit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id TEXT NOT NULL,
    company_name TEXT DEFAULT '',
    period TEXT DEFAULT '',
    total_violations INTEGER DEFAULT 0,
    by_severity JSONB DEFAULT '{}'::jsonb,
    file_name TEXT DEFAULT '',
    user_email TEXT DEFAULT '',
    ran_at TIMESTAMPTZ DEFAULT now(),
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Cột payload (fix review) — thêm nếu bảng cũ chưa có
ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS payload jsonb;

-- 3) Index cho các query thường dùng
CREATE INDEX IF NOT EXISTS idx_audit_history_audit_id ON audit_history (audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_ran_at ON audit_history (ran_at DESC);

-- 4) RLS: chỉ service_role (server-side) đọc — khách hàng không đọc được lịch sử
ALTER TABLE audit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Server only insert" ON audit_history;
CREATE POLICY "Server only insert" ON audit_history FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Server only read" ON audit_history;
CREATE POLICY "Server only read" ON audit_history FOR SELECT USING (auth.role() = 'service_role');