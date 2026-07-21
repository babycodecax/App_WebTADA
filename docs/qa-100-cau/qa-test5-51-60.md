---
title: Test5 — Lô 6 (câu 51–60) — Chuẩn luật 2026
domain: tax
tags:
  - tax
  - tax/test
source: D:/CodeApp/Projects/ai-second-brain/DataTest/_test5_extract.txt (Test5.docx, 100 câu)
status: active
updated: 2026-07-18
---

# Test5 — Lô 6 (câu 51–60): Mẫu biểu HĐĐT (tiếp) & Chi phí được trừ

> **Chuẩn áp dụng:** TT 91/2026 + NĐ 320/2025 (chi phí) + Luật 48/2024 GTGT.
> **Ghi chú:** Câu 51–56 (mẫu biểu): vault có 01/TB-RSĐT, 01/GTGT nhưng KHÔNG có 01/TB-KTDL, 03/TNCN, 02/BH, 01/BTS → ⚠️. Câu 57–60 (chi phí): vault `nd-320-2025-tndn` + cheatsheet có đủ → ✅.

---

### Câu 51 — Mẫu thông báo của cơ quan thuế về HĐĐT cần rà soát? (Đáp án: 01/TB-RSĐT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-91-2026-dieu-10` (khoản 3) ghi "cơ quan thuế thông báo theo Mẫu số 01/TB-RSĐT Phụ lục IV để người bán kiểm tra nội dung sai". Khớp.
- **Vault:** [[tt-91-2026-dieu-10]]

### Câu 52 — Thông báo kết quả kiểm tra dữ liệu HĐĐT của cơ quan thuế? (Đáp án: 01/TB-KTDL)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Đã bổ sung từ TT 91/2026 Phụ lục IV (note [[tt-91-2026-dieu-4]]): danh mục thông báo cơ quan thuế có **01/TB-KTDL — Thông báo về việc kết quả kiểm tra dữ liệu hóa đơn điện tử**. Khớp.
- **Vault:** [[tt-91-2026-dieu-10]] · [[tt-91-2026-dieu-4]]

### Câu 53 — Chứng từ khấu trừ thuế TNCN điện tử năm 2026? (Đáp án: 03/TNCN)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Đã bổ sung từ TT 91/2026 Phụ lục II & IV (note [[tt-91-2026-dieu-17]] · [[tt-91-2026-dieu-4]]): chứng từ khấu trừ thuế TNCN điện tử có ký hiệu mẫu **03/TNCN** (ví dụ 03/TNCNCT26AA). Khớp.
- **Vault:** [[tt-91-2026-dieu-17]] · [[tt-91-2026-dieu-4]]

### Câu 54 — Hóa đơn GTGT điện tử theo TT 91/2026 là mẫu nào? (Đáp án: 01/GTGT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-91-2026-dieu-5` (khoản 4) ghi "Mẫu số 01/GTGT-TKHT"; `tt-89-2026-dieu-42` ghi "Tờ khai thuế GTGT mẫu số 01/GTGT". Khớp (01/GTGT).
- **Vault:** [[tt-91-2026-dieu-5]] · [[chung/tt-89-2026/tt-89-2026-dieu-42]]

### Câu 55 — Mẫu HĐĐT bán hàng dùng cho tổ chức, cá nhân nộp thuế trực tiếp? (Đáp án: 02/BH)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Đã bổ sung từ TT 91/2026 Phụ lục IV (note [[tt-91-2026-dieu-4]]): **02/BH — Hóa đơn điện tử bán hàng (dùng cho tổ chức, cá nhân khai thuế GTGT theo phương pháp trực tiếp)**. Khớp.
- **Vault:** [[tt-91-2026-dieu-4]]

### Câu 56 — Mẫu HĐĐT bán tài sản công năm 2026? (Đáp án: 01/BTS)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Đã bổ sung từ TT 91/2026 Phụ lục IV (note [[tt-91-2026-dieu-6]] · [[tt-91-2026-dieu-4]]): **01/BTS — Hóa đơn bán tài sản phải đăng ký quyền sử dụng, quyền sở hữu**. Khớp (ký hiệu mẫu số 3 = HĐĐT bán tài sản công, xem Phụ lục I).
- **Vault:** [[tt-91-2026-dieu-6]] · [[tt-91-2026-dieu-4]]

### Câu 57 — Bán hàng giá trị < 05 triệu thanh toán tiền mặt có được tính chi phí được trừ không? (Đáp án: Được tính nếu có hóa đơn, chứng từ hợp pháp)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-320-2025-tndn` (Đ9) + cheatsheet ghi ngưỡng KHÔNG được trừ là thanh toán không tiền mặt từng lần ≥ 5 triệu. Suy luận: < 5 triệu tiền mặt vẫn được trừ nếu có hóa đơn/chứng từ. Khớp.
- **Vault:** [[nd-320-2025-tndn]] · [[_cheatsheet-thue-2026]]

### Câu 58 — Tổng mua của 1 người bán trong 1 ngày từ 05 triệu trở lên phải thanh toán thế nào? (Đáp án: Phải có chứng từ thanh toán không dùng tiền mặt)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault cheatsheet ghi "Chi không tiền mặt từng lần ≥ 5 triệu → KHÔNG được trừ". Suy luận: từ 5 triệu phải có chứng từ không dùng tiền mặt. Khớp.
- **Vault:** [[_cheatsheet-thue-2026]] · [[nd-320-2025-tndn]]

### Câu 59 — NV mua hàng từ 05 triệu bằng thẻ cá nhân rồi thanh toán lại có được trừ không? (Đáp án: Có, nếu có quy chế tài chính và thanh toán lại không dùng tiền mặt)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-320-2025-tndn` (Đ9.1c) quy định thanh toán không tiền mặt; cheatsheet ghi ngưỡng 5 triệu. Điều kiện "có quy chế + thanh toán lại KDM" là chi tiết thực tế khớp nguyên tắc. Khớp.
- **Vault:** [[nd-320-2025-tndn]] · [[_cheatsheet-thue-2026]]

### Câu 60 — Mua nông sản của người SX không có HĐ phải dùng bảng kê nào? (Đáp án: Bảng kê mẫu số 02/TNDN)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `tt-20-2026-tndn` (Điều 3) đã ghi rõ "mua hàng không hóa đơn (bảng kê `02/TNDN`)". Khớp đáp án (bảng kê mẫu số 02/TNDN). (Lần đánh giá trước ghi ⚠️ là nhầm — vault thực tế có mã 02/TNDN.)
- **Vault:** [[tt-20-2026-tndn]]

---

**Tổng kết Lô 6 (câu 51–60):** ✅ 10 · ⚠️ 0 · ❌ 0
