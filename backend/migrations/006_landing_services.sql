-- 2026-08-08 landing-services.sql
-- Bảng landing_services: nội dung dịch vụ hiển thị trên landing page.
--   - Landing page (index.html) render 1 khối văn bản nối tiếp (mỗi dòng 1 dịch vụ).
--   - Toàn bộ nội dung nằm trong HÀNG SENTINEL có group_name = '__services_content__'
--     (cột description chứa toàn bộ văn bản, mỗi dòng 1 dịch vụ — admin tự viết emoji).
--   - Hàng sentinel dùng KHÓA CỐ ĐỊNH id = '00000000-0000-4000-8000-0000000000aa' để
--     /api/admin/services upsert atomic (onConflict: 'id') — chống duplicate khi 2 admin lưu cùng lúc.
--   - API public /api/services trả description của hàng sentinel (is_active = true).
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)
--   LƯU Ý: chạy lại file này là an toàn (idempotent) — không đè dữ liệu admin đã lưu.

CREATE TABLE IF NOT EXISTS landing_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name TEXT NOT NULL,
    group_emoji TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS landing_services_active_idx
    ON landing_services (is_active, group_name, sort_order);

-- ============================================================
-- Hàng sentinel: nội dung dịch vụ duy nhất (id CỐ ĐỊNH để upsert atomic).
-- INSERT ... ON CONFLICT (id) DO NOTHING → idempotent, không đè nội dung admin đã lưu.
-- ============================================================
INSERT INTO landing_services (id, group_name, group_emoji, sort_order, name, description, is_active)
VALUES (
    '00000000-0000-4000-8000-0000000000aa',
    '__services_content__',
    '',
    0,
    '__services_content__',
    '🏠 Kế toán dịch vụ trọn gói
🏠 Thành lập & Giải thể Doanh nghiệp
🏠 Kê khai thuế TNCN / GTGT
🏠 Đăng ký HKD & Hóa đơn điện tử
🏠 Kiểm toán & Lập BCTC, Fix lỗi Thuế
🏠 Kê khai Bảo hiểm xã hội
🌟 Hoàn thuế TNCN
🌟 Giải quyết BHXH thất nghiệp
🌟 Thay đổi thông tin cá nhân (CCCD, địa chỉ, SĐT)',
    true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Dọn dữ liệu cũ: nếu trước đây hàng sentinel được tạo với id ngẫu nhiên
-- (bản API cũ insert thiếu id cố định), gắn đúng id cố định để upsert atomic hoạt động.
-- Xóa luôn các hàng dịch vụ cũ (giao diện nhóm cũ đã bỏ) — tránh nhầm lẫn với hàng sentinel.
-- ============================================================
UPDATE landing_services
SET id = '00000000-0000-4000-8000-0000000000aa',
    group_emoji = '',
    sort_order = 0,
    name = '__services_content__',
    features = '[]'::jsonb,
    is_active = true
WHERE group_name = '__services_content__'
  AND id <> '00000000-0000-4000-8000-0000000000aa';

DELETE FROM landing_services
WHERE group_name <> '__services_content__';