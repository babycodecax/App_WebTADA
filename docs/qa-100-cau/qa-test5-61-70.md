---
title: Test5 — Lô 7 (câu 61–70) — Chuẩn luật 2026
domain: tax
tags:
  - tax
  - tax/test
source: D:/CodeApp/Projects/ai-second-brain/DataTest/_test5_extract.txt (Test5.docx, 100 câu)
status: active
updated: 2026-07-18
---

# Test5 — Lô 7 (câu 61–70): Chi phí được trừ & Giá tính thuế GTGT

> **Chuẩn áp dụng:** NĐ 320/2025 (chi phí) + Luật 48/2024 GTGT (giá tính thuế) + NĐ 68/2026 (HKD nông sản).
> **Ghi chú:** Vault có đủ nội dung cho các câu 61–70 (trang phục 5tr, hội đồng nghiệm thu, tiền phạt, nông sản, điều chuyển/góp vốn, giá 0, phiếu mua hàng, đại lý). → Đa số ✅.

---

### Câu 61 — Chi trang phục bằng tiền vượt mức nào thì không được trừ? (Đáp án: Vượt 05 triệu đồng/người/năm)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-320-2025-tndn` (Đ10) ghi rõ "Chi trang phục bằng tiền: vượt 05 triệu đồng/người/năm → không trừ". Khớp.
- **Vault:** [[nd-320-2025-tndn]]

### Câu 62 — Chi thưởng sáng kiến nhưng không có hội đồng nghiệm thu? (Đáp án: Không được tính vào chi phí được trừ)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault cheatsheet ghi "Chi thưởng sáng kiến không có quy chế → KHÔNG được trừ" (Đ9.3e NĐ 320). Khớp (không hội đồng nghiệm thu = không đủ điều kiện).
- **Vault:** [[_cheatsheet-thue-2026]] · [[nd-320-2025-tndn]]

### Câu 63 — Tiền nộp phạt vi phạm hành chính về thuế, hóa đơn có được trừ không? (Đáp án: Không được trừ)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault cheatsheet + `nd-320-2025-tndn` ghi "Tiền phạt vi phạm → KHÔNG được trừ". Khớp.
- **Vault:** [[_cheatsheet-thue-2026]] · [[nd-320-2025-tndn]]

### Câu 64 — HKD nông sản do mình tự sản xuất bán ra dùng loại HĐ nào? (Đáp án: Không chịu thuế GTGT nên có thể không lập HĐ GTGT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-48-2024-gtgt` (Điều 5) ghi nông sản chưa chế biến KHÔNG chịu thuế GTGT. `nd-68-2026` ghi HKD doanh thu ≤01 tỷ không chịu thuế GTGT. Khớp (tự SX nông sản → không chịu thuế GTGT).
- **Vault:** [[luat-48-2024-gtgt]] · [[nd-68-2026-ho-kinh-doanh]]

### Câu 65 — Doanh nghiệp sáp nhập điều chuyển tài sản cho nhau có phải lập HĐ GTGT không? (Đáp án: Không phải lập HĐ, dùng lệnh điều chuyển + bộ hồ sơ nguồn gốc)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-108-2025-quan-ly-thue` ghi sáp nhập/hợp nhất/chia tách là trường hợp tổ chức lại, không phải giao dịch bán → không lập HĐ (dùng hồ sơ nguồn gốc). Khớp nguyên tắc.
- **Vault:** [[luat-108-2025-quan-ly-thue]]

### Câu 66 — Góp vốn bằng tài sản vào doanh nghiệp cần chứng từ gì? (Đáp án: Biên bản góp vốn, biên bản định giá tài sản + bộ hồ sơ nguồn gốc)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-108-2025-quan-ly-thue` + nguyên tắc góp vốn là tổ chức lại/không phải bán → cần biên bản góp vốn, định giá, hồ sơ nguồn gốc. Khớp.
- **Vault:** [[luat-108-2025-quan-ly-thue]]

### Câu 67 — Xuất hàng mẫu dùng thử không thu tiền, giá tính thuế bằng bao nhiêu? (Đáp án: Giá tính thuế = 0)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-254-2026-hoa-don-dien-tu` (Điều 4.1) liệt "biếu tặng, xuất nội bộ" phải lập HĐ, và `luat-48-2024-gtgt` nguyên tắc giá tính thuế với hàng biếu tặng/mẫu = 0 (không thu tiền). Khớp.
- **Vault:** [[nd-254-2026-hoa-don-dien-tu]] · [[luat-48-2024-gtgt]]

### Câu 68 — Tặng quà khách hàng không thu tiền, HĐ ghi thế nào? (Đáp án: Ghi đầy đủ chỉ tiêu, thuế suất, giá tính thuế = 0)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-254-2026-hoa-don-dien-tu` (Điều 4.1) quy định "biếu tặng" phải lập HĐĐT giao khách, đầy đủ chỉ tiêu, giá tính thuế = 0. Khớp.
- **Vault:** [[nd-254-2026-hoa-don-dien-tu]]

### Câu 69 — Bán hàng kèm phiếu mua hàng, giá tính thuế có bao gồm giá trị phiếu không? (Đáp án: Không bao gồm giá trị phiếu mua hàng)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `luat-48-2024-gtgt` nguyên tắc giá tính thuế GTGT = giá bán chưa thuế, phiếu mua hàng là cam kết giảm giá sau → không tính vào giá tính thuế lần bán này. Khớp.
- **Vault:** [[luat-48-2024-gtgt]]

### Câu 70 — Đại lý bán đúng giá hưởng hoa hồng, giá tính thuế GTGT là gì? (Đáp án: Tiền hoa hồng được hưởng chưa có thuế GTGT)
- **Đánh giá:** ✅ (PASS)
- **Lý do:** Vault `nd-254-2026-hoa-don-dien-tu` (Điều 4) + nguyên tắc đại lý bán đúng giá: cơ sở chỉ chịu thuế trên hoa hồng. Khớp.
- **Vault:** [[nd-254-2026-hoa-don-dien-tu]]

---

**Tổng kết Lô 7 (câu 61–70):** ✅ 10 · ⚠️ 0 · ❌ 0
