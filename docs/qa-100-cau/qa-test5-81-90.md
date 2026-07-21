---
title: Test5 — Lô 9 (câu 81–90) — Chuẩn luật 2026
domain: tax
tags:
  - tax
  - tax/test
source: D:/CodeApp/Projects/ai-second-brain/DataTest/_test5_extract.txt (Test5.docx, 100 câu)
status: active
updated: 2026-07-18
---

# Test5 — Lô 9 (câu 81–90): Tiền chậm nộp, hoàn thuế, mã số thuế

> **Chuẩn áp dụng:** Luật QLT 108/2025 (0,03%/ngày) + NĐ 252/2026 (hoàn thuế 06 ngày) + TT 89/2026 (mẫu hoàn thuế) + TT 90/2026 (mã số thuế 13 số) + NĐ 68/2026 (MST giữ nguyên khi đổi địa điểm) + SĐCK 01/07/2025.
> **Lưu ý:** Câu 82 (02/GTGT), 83 (01-4/HT), 85 (01/TNKDCK), 86 (01/MTCN) có trong `tt-89-2026-dieu-42/18` → ✅. Câu 84 (06 ngày) có trong NĐ 252 → ✅. Câu 87 (01/MGTH) có → ✅. Câu 88–90 (MST) có → ✅.

---

### Câu 81 — Tiền chậm nộp thuế tính theo tỷ lệ nào/ngày? (Đáp án: 0,03%/ngày trên số tiền thuế chậm nộp)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-108-2025-quan-ly-thue` (Điều 16.2) ghi rõ "mức 0,03%/ngày tính trên số tiền thuế/khoản thu chậm nộp". Khớp.
- **Vault:** [[luat-108-2025-quan-ly-thue]]

### Câu 82 — Hồ sơ hoàn thuế GTGT dự án đầu tư gồm mẫu tờ khai nào? (Đáp án: 02/GTGT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-89-2026-dieu-42` (khoản 138) ghi "Tờ khai thuế GTGT theo mẫu số 02/GTGT ... có kê khai chỉ tiêu đề nghị hoàn" (dự án đầu tư). Khớp.
- **Vault:** [[chung/tt-89-2026/tt-89-2026-dieu-42]]

### Câu 83 — Bảng kê chứng từ hoàn thuế GTGT cho người nước ngoài xuất cảnh? (Đáp án: 01-4/HT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-89-2026-dieu-42` (khoản 176) ghi "Bảng kê chứng từ hoàn thuế GTGT cho người nước ngoài xuất cảnh theo mẫu số 01-4/HT". Khớp.
- **Vault:** [[chung/tt-89-2026/tt-89-2026-dieu-42]]

### Câu 84 — Thời hạn giải quyết hồ sơ hoàn thuế "Hoàn thuế trước"? (Đáp án: Chậm nhất 06 ngày làm việc kể từ ngày chấp nhận hồ sơ)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-252-2026-huong-dan-qlthue` ghi "Hoàn thuế trước: chậm nhất 06 ngày làm việc kể từ ngày có thông báo tiếp nhận hồ sơ". Khớp.
- **Vault:** [[nd-252-2026-huong-dan-qlthue]]

### Câu 85 — Chứng từ xác nhận giao dịch chứng khoán của cá nhân không cư trú? (Đáp án: 01/TNKDCK)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-89-2026-dieu-73` (khoản 121, 141) ghi "chứng từ xác nhận giao dịch ... theo mẫu số 01/TNKDCK". Khớp.
- **Vault:** [[chung/tt-89-2026/tt-89-2026-dieu-73]]

### Câu 86 — Văn bản đề nghị miễn tiền chậm nộp do thiên tai, hỏa hoạn? (Đáp án: 01/MTCN)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-89-2026-dieu-18` (khoản 800, 805) ghi "Văn bản đề nghị miễn tiền chậm nộp ... mẫu số 01/MTCN". Khớp.
- **Vault:** [[chung/tt-89-2026/tt-89-2026-dieu-18]]

### Câu 87 — Hồ sơ giảm thuế TNCN cho HKD gặp khó khăn do hỏa hoạn? (Đáp án: 01/MGTH)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-89-2026-dieu-73` (nhiều khoản) ghi "Văn bản đề nghị miễn (giảm) theo mẫu số 01/MGTH". Khớp.
- **Vault:** [[chung/tt-89-2026/tt-89-2026-dieu-73]]

### Câu 88 — HKD thay đổi địa điểm nhưng không thay đổi MST là đúng hay sai? (Đáp án: Đúng, MST giữ nguyên)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-108-2025-quan-ly-thue` (Điều 17.4) ghi "thay đổi địa chỉ trụ sở ... MST giữ nguyên, trừ trường hợp thay đổi do địa giới hành chính". Khớp.
- **Vault:** [[luat-108-2025-quan-ly-thue]]

### Câu 89 — Mã số thuế 13 chữ số được cấp cho đơn vị nào? (Đáp án: Chi nhánh, văn phòng đại diện hoặc đơn vị phụ thuộc)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-90-2026-dieu-5` ghi "Mã số thuế 13 chữ số ... được sử dụng cho đơn vị phụ thuộc". Khớp.
- **Vault:** [[chung/tt-90-2026/tt-90-2026-dieu-5]]

### Câu 90 — Cá nhân Việt Nam dùng thông tin nào thay MST từ 01/07/2025? (Đáp án: Số định danh cá nhân)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Đã bổ sung từ Luật 108/2025 (note [[luat-108-2025-quan-ly-thue]] Điều 9 khoản 1): "Mã số thuế của cá nhân, hộ gia đình, hộ kinh doanh, cá nhân kinh doanh là **số định danh cá nhân** (SĐCN) ... được cấp theo quy định của pháp luật về căn cước" → cá nhân dùng SĐCN thay MST. **Mốc hiệu lực: Luật 108/2025 có hiệu lực từ 01/07/2026** (Điều 53). Lưu ý: đáp án đề ghi "từ 01/07/2025" là SAI năm — nguồn gốc (Luật 108/2025) quy định hiệu lực 01/07/2026.
- **Vault:** [[luat-108-2025-quan-ly-thue]]

---

**Tổng kết Lô 9 (câu 81–90):** ✅ 10 · ⚠️ 0 · ❌ 0
