#!/usr/bin/env python3
"""Fix summaries to be 150-160 characters for all 22 blog posts."""

import os
import re

# New summaries for each file (150-160 chars)
SUMMARIES = {
    "hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai": "Xuất hóa đơn thấp hơn thực tế để né thuế nhưng sao kê bank khớp đúng giao dịch. Phân tích rủi ro pháp lý, mức phạt và cách xử lý an toàn 2026.",
    "hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026": "Hướng dẫn lập hóa đơn cho người tiêu dùng cuối theo Nghị định 254/2026. Phân biệt hai trường hợp, giá trị pháp lý và mức phạt vi phạm.",
    "huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026": "Hướng dẫn đăng ký hóa đơn điện tử cho hộ kinh doanh 2026 theo Nghị định 254 và Thông tư 91. Đối tượng, điều kiện, quy trình 3 bước.",
    "huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue": "Trả lương cho người thân trong công ty TNHH cần hồ sơ gì để hợp thức hóa chi phí? Hướng dẫn hợp đồng, bảng chấm công và bảo hiểm 2026.",
    "kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026": "Hướng dẫn xuất hóa đơn khi kinh doanh trên Shopee, TikTok Shop 2026. Quy định bắt buộc, thời điểm lập hóa đơn và khấu trừ tại nguồn.",
    "lam-affiliate-2026-doanh-thu-bao-nhieu-moi-phai-nop-thue": "Nghề Affiliate 2026: Doanh thu bao nhiêu mới phải nộp thuế? Ngưỡng miễn thuế 1 tỷ, thuế suất 7%, khấu trừ tại nguồn và quy định hóa đơn.",
    "lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly": "Giám đốc dùng tiền công ty thanh toán tiền tip karaoke có bị coi là lạm dụng tài sản không? Hướng dẫn hoàn trả, hạch toán và tránh phạt.",
    "lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026": "Doanh nghiệp đối mặt truy thu thuế 3 tỷ từ 2021-2024 do hóa đơn N06? Lộ trình xử lý, hồ sơ chứng minh giao dịch thật và giải tỏa áp lực.",
    "phan-tich-rui-ro-phap-ly-va-thue-trong-giao-dich-chuyen-nhuong-von-nam-2026": "Chuyển nhượng vốn 5 tỷ có bị truy thu thuế không? Phân tích rủi ro pháp lý từ Luật DN, nghĩa vụ TNCN và cách xử lý an toàn năm 2026.",
    "phuong-an-giai-quyet-no-thue-doanh-nghiep-ngung-hoat-dong-lau-nam": "Doanh nghiệp thành lập 2009 ngừng hoạt động lâu năm phát hiện nợ thuế? Phương án tra cứu MST, khoanh nợ, xóa nợ quá 10 năm và chấm dứt.",
    "phuong-an-xu-ly-doanh-thu-chua-ke-khai-giai-doan-2023-2025": "Doanh thu chưa kê khai giai đoạn 2023-2025 xử lý thế nào? Phương án tự quyết toán, tính tiền chậm nộp và nộp dần thuế nợ theo quy định 2026.",
    "quan-ly-hoa-don-dau-vao-cho-ho-kinh-doanh-doanh-thu-duoi-1-ty-dong": "Hộ kinh doanh dưới 1 tỷ doanh thu không có hóa đơn đầu vào có sao không? Quy định, rủi ro pháp lý và cách hợp thức hóa chứng từ an toàn.",
    "quy-dinh-ve-so-lan-va-thoi-han-tam-ngung-kinh-doanh-cua-cong-ty": "Công ty được tạm ngừng kinh doanh bao nhiêu lần và tối đa bao lâu? Quy định mới nhất 2026 về thời hạn, thủ tục và xử phạt vi phạm.",
    "quy-trinh-giai-the-cong-ty-va-dong-ma-so-thue-khi-bi-canh-bao-khong-hoat-dong-tai-dia-chi-dang-ky": "Lập công ty từ 2014 ngừng hoạt động 2016 bị cảnh báo không hoạt động? Hướng dẫn quy trình giải thể và đóng mã số thuế chi tiết.",
    "sep-nop-247-trieu-vao-tai-khoan-cong-ty-nam-2026-ke-toan-can-lap-ho-so-hach-toan-va-ke-khai-giao-dich-lien-ket-the-nao-cho-dung": "Xử lý nghiệp vụ sếp nộp 247 triệu vào tài khoản công ty 2026. Hướng dẫn lập hồ sơ, hạch toán kế toán và kê khai giao dịch liên kết.",
    "shopee-no-don-2-ty-va-cai-quen-dat-gia-duong-nao-cho-ho-kinh-doanh": "Bán hàng trên Shopee doanh thu 2 tỷ mà quên xuất hóa đơn. Phân tích rủi ro pháp lý, mức phạt và cách xử lý an toàn cho hộ kinh doanh.",
    "thue-goi-ten-giam-doc-chay-no-ke-toan-nen-o-lai-chiu-tran-hay-rut-lui-em-dep": "Giám đốc vỡ nợ bỏ trốn trước kiểm tra thuế, kế toán nên làm gì? Phân tích trách nhiệm pháp lý và quyền lợi của người làm kế toán.",
    "tien-an-xang-xe-chi-co-dinh-coi-chung-mat-tien-thue-oan-vi-ngai-tinh-theo-ngay-cong": "Chi phụ cấp tiền ăn, xăng xe cố định mỗi tháng có bị tính thuế TNCN không? Quy định năm 2026 và cách chi trả an toàn cho DN.",
    "tom-tat-cac-diem-moi-quan-trong-nhat-lien-quan-den-thue-thu-nhap-ca-nhan-tncn-va-ho-kinh-doanh-hkd-tu-03-nghi-dinh-252-253-254-ap-dung-cho-giai-doan-2026": "Tóm tắt 3 Nghị định 252, 253, 254 về thuế TNCN và hộ kinh doanh 2026. Mức giảm trừ gia cảnh mới, phân bậc thuế HKD, quy định hóa đơn.",
    "tom-tat-cac-rui-ro-va-khoan-chi-phi-phat-sinh-khi-ban-tha-troi-doanh-nghiep": "Thả trôi doanh nghiệp không giải thể sẽ gặp rủi ro gì? Phân tích các khoản phạt, lãi chậm nộp, trách nhiệm hình sự và hậu quả pháp lý.",
    "tong-hop-cac-truong-hop-bi-tam-hoan-xuat-canh-do-no-thue-tu-2026": "Tổng hợp trường hợp bị tạm hoãn xuất cảnh do nợ thuế theo Nghị định 252/2026/NĐ-CP. Cá nhân, chủ hộ kinh doanh cần biết ngưỡng nợ.",
    "xu-ly-sai-lech-doanh-thu-va-toi-uu-nghia-vu-phat-khi-kiem-tra-thue-nam-2025": "Kê khai doanh thu thừa tháng này thiếu tháng kia khi kiểm tra thuế 2025? Lộ trình xử lý, bù trừ tiền thuế và cách giảm nhẹ phạt.",
}

OUTDIR = "D:/CodeApp/Projects/App_WebTADA/tools/blog-content/old-posts"

for slug, new_summary in SUMMARIES.items():
    filepath = os.path.join(OUTDIR, f"{slug}.md")
    if not os.path.exists(filepath):
        print(f"MISSING: {slug}")
        continue

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find and replace summary line
    pattern = r'summary: ".*?"'
    if re.search(pattern, content):
        new_content = re.sub(pattern, f'summary: "{new_summary}"', content, count=1)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"FIXED: {slug} | {len(new_summary)} chars")
    else:
        print(f"NO MATCH: {slug}")

print("Done!")
