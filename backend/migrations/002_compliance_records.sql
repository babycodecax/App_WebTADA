-- 2026-08-02 compliance-records.sql
-- Bảng compliance_records: bản ghi quy định thuế/kế toán có cấu trúc
-- (knowledge extraction kiểu Hyper-Extract, không dùng embedding).
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py  (cần SUPABASE_PSQL trong .env)

-- Lưu ý: dùng gen_random_uuid() (pgcrypto — có sẵn Supabase) thay
-- uuid_generate_v4() (uuid-ossp) để không phụ thuộc extension phải cài tay.
CREATE TABLE IF NOT EXISTS compliance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    regulation TEXT NOT NULL,
    numeric_values JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditions TEXT NOT NULL DEFAULT '',
    legal_basis TEXT NOT NULL DEFAULT '',
    effective_date TEXT NOT NULL DEFAULT '',
    raw_chunk TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Upsert theo nội dung (file + quy định) — chạy extract lại nhiều lần
-- không sinh bản ghi trùng.
ALTER TABLE compliance_records
    ADD CONSTRAINT compliance_records_source_regulation_key
    UNIQUE (source_file, regulation);

-- Index phụ: tìm nhanh theo file nguồn khi rebuild index / xoá theo file.
CREATE INDEX IF NOT EXISTS compliance_records_source_file_idx
    ON compliance_records (source_file);

-- Xác nhận: SELECT conname FROM pg_constraint WHERE conname = 'compliance_records_source_regulation_key';
