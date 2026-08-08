-- 2026-08-08 landing-services.sql
-- Bảng landing_services: danh mục dịch vụ hiển thị động trên landing page.
--   - Landing page (index.html) render 2 nhóm: "Hộ kinh doanh & Doanh nghiệp" + "Cá nhân/Người lao động"
--   - Admin chỉnh sửa tên nhóm, emoji, tên/mô tả/features dịch vụ, thứ tự, trạng thái qua
--     /api/admin/services (xem/quản lý file api/app/api/admin/services/route.ts)
--   - API public /api/services chỉ trả các dịch vụ is_active = true, group theo group_name.
--
-- Cách chạy (chọn 1):
--   a) Supabase Dashboard → SQL Editor → dán nội dung file này → Run
--   b) backend: .venv\Scripts\python.exe migrate.py (cần SUPABASE_PSQL trong .env)

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

-- Mặc định: 6 dịch vụ nhóm doanh nghiệp + 3 dịch vụ nhóm cá nhân.
-- INSERT ... SELECT với WHERE NOT EXISTS để không đè dữ liệu admin đã sửa khi chạy lại migration.
INSERT INTO landing_services (group_name, group_emoji, sort_order, name, description, features)
SELECT v.group_name, v.group_emoji, v.sort_order, v.name, v.description, v.features::jsonb
FROM (VALUES
('Hộ kinh doanh & Doanh nghiệp', '🏠', 1, 'Kế toán dịch vụ trọn gói',
 'Thay mặt doanh nghiệp xử lý toàn bộ các công việc kế toán phát sinh hàng tháng, báo cáo cơ quan thuế định kỳ.',
 '["Nhận, phân loại chứng từ hóa đơn","Ghi chép sổ sách kế toán trên phần mềm","Đóng vai trò kế toán trưởng làm việc với thuế"]'),
('Hộ kinh doanh & Doanh nghiệp', '🏠', 2, 'Thành lập & Giải thể Doanh nghiệp',
 'Hỗ trợ trọn gói các thủ tục pháp lý thành lập công ty mới hoặc thực hiện quy trình giải thể doanh nghiệp đúng luật, nhanh gọn.',
 '["Soạn thảo hồ sơ đăng ký kinh doanh","Thay mặt doanh nghiệp nộp Sở KH&ĐT","Thủ tục giải thể, quyết toán thuế"]'),
('Hộ kinh doanh & Doanh nghiệp', '🏠', 3, 'Kê khai thuế TNCN / GTGT',
 'Thực hiện lập tờ khai, kiểm tra số liệu thuế Thu nhập cá nhân và Thuế Giá trị gia tăng định kỳ (tháng/quý) chính xác.',
 '["Kê khai báo cáo thuế GTGT đầu ra, đầu vào","Khai thuế TNCN cho người lao động","Hạn chế tối đa sai sót và chậm trễ nộp tờ khai"]'),
('Hộ kinh doanh & Doanh nghiệp', '🏠', 4, 'Đăng ký HKD & Hóa đơn điện tử',
 'Trọn gói đăng ký hộ kinh doanh cá thể, thiết lập hệ thống sổ sách và đăng ký sử dụng hóa đơn điện tử lần đầu.',
 '["Đăng ký giấy phép Hộ kinh doanh","Khởi tạo và đăng ký sử dụng hóa đơn điện tử","Hướng dẫn sử dụng chi tiết, đúng luật"]'),
('Hộ kinh doanh & Doanh nghiệp', '🏠', 5, 'Kiểm toán & Lập BCTC, Fix lỗi Thuế',
 'Kiểm tra toàn bộ hệ thống sổ sách, lập báo cáo tài chính cuối năm và thực hiện sửa lỗi dữ liệu thuế lịch sử.',
 '["Soát xét sổ sách kế toán nhiều năm","Khắc phục, điều chỉnh tờ khai sai sót","Hỗ trợ lên BCTC chuyên nghiệp chuẩn mực"]'),
('Hộ kinh doanh & Doanh nghiệp', '🏠', 6, 'Kê khai Bảo hiểm xã hội',
 'Thực hiện các thủ tục khai báo bảo hiểm, đăng ký tăng giảm lao động và giải quyết các chế độ BHXH định kỳ cho doanh nghiệp.',
 '["Báo tăng, giảm lao động tham gia BHXH","Giải quyết các chế độ thai sản, ốm đau","Hồ sơ cấp thẻ BHYT nhanh chóng"]'),
('Cá nhân/Người lao động', '🌟', 1, 'Hoàn thuế TNCN',
 'Hỗ trợ người nộp thuế lập hồ sơ quyết toán và xin hoàn lại số thuế TNCN nộp thừa một cách nhanh nhất, đúng quy định.',
 '["Kiểm tra chứng từ khấu trừ thuế","Lập tờ khai quyết toán thuế TNCN điện tử","Theo dõi tiến độ hồ sơ cho đến khi nhận tiền"]'),
('Cá nhân/Người lao động', '🌟', 2, 'Giải quyết BHXH thất nghiệp',
 'Tư vấn hồ sơ và quy trình hưởng trợ cấp thất nghiệp của bảo hiểm xã hội, hỗ trợ chuẩn bị hồ sơ đầy đủ.',
 '["Kiểm tra quá trình đóng và chốt sổ BHXH","Hướng dẫn quy trình nộp hồ sơ online/offline","Giải quyết các trường hợp vướng mắc"]'),
('Cá nhân/Người lao động', '🌟', 3, 'Thay đổi thông tin cá nhân (CCCD, địa chỉ, SĐT)',
 'Cập nhật thông tin CCCD mới, số điện thoại hoặc địa chỉ liên lạc với Cơ quan thuế và Bảo hiểm xã hội.',
 '["Điều chỉnh mã số thuế theo CCCD mới","Cập nhật thông tin ứng dụng VssID","Hồ sơ đồng bộ hóa dữ liệu cá nhân liên quan"]')
) AS v(group_name, group_emoji, sort_order, name, description, features)
WHERE NOT EXISTS (SELECT 1 FROM landing_services);