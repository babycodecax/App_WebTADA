---
title: Tổng hợp 3 đợt Test (Test2–Test4) vs Vault Thuế & Kế toán
domain: tax
tags:
  - tax
  - tax/doi-chieu
source: doi-chieu-test2/test3/test4-vs-vault.md tổng hợp chéo
status: draft
updated: 2026-07-18
---

# Tổng hợp 3 đợt Test (Test2–Test4) vs Vault Thuế & Kế toán

> **Mục tiêu:** Gom 3 báo cáo đối chiếu (Test2/Test3/Test4) thành 1 bức tranh chung; đặc biệt **gop các câu ⚠️ trùng nhau** giữa các đợt để bổ sung vault **1 lần**.
> **Thước đo:** Vault `thue-ke-toan/` (chỉ nội dung có trong vault + nguồn gốc). ❌ = vault đúng luật 2026, đề sai → KHÔNG sửa vault.
> **Test1 (baseline):** ✅100 ⚠️0 ❌0 — đã đồng bộ mốc 500tr→01tỷ, dùng làm nền tảng, không liệt kê lại.

---

## 1. BẢNG TỔNG QUAN 4 ĐỢT

| Đợt | File | ✅ Khớp | ⚠️ Thiếu | ❌ Sai (vault đúng) | Đặc điểm |
|---|---|---|---|---|---|
| Test1 | Test1.docx | **100** | 0 | 0 | Baseline, đề dùng luật cũ (100tr/TT40) nhưng đáp án khớp; đã đồng bộ mốc 01tỷ |
| Test2 | Test2.docx | **44** | **54** | **2** | Đề dùng nhiều **luật cũ** (trần 1,6tỷ, 150% LS NHNN, dự phòng 17%…) → ⚠️/❌ cao |
| Test3 | Test3.docx | **59** | **39** | **1** | Chuẩn 2026, sạch hơn; ❌(62) vault đúng |
| Test4 | Test4.docx | **37** | **62** | **1** | Thiên sâu kế toán/Thông tư 99 (29 câu đầu ⚠️) + con số thuế 2026 |
| **Cộng 2-4** | | **140** | **155** | **4** | |

> Tổng 3 đợt Test2–4 = **300 câu**, trong đó ❌ chỉ **4 câu** và **TẤT CẢ ĐỀU LÀ VAULT ĐÚNG** (đề sai do dùng luật cũ).

---

## 2. CÁC CÂU ❌ (4 câu — vault đúng, KHÔNG sửa)

| STT | Đợt | Chủ đề | Đề ghi | Vault (đúng 2026) |
|---|---|---|---|---|
| 1 | T2/24 | Trần KH xe ô tô TNDN | 1,6tỷ (luật cũ NĐ 218/2013) | Luật 67/2025 **bỏ trần** → không trừ KH |
| 2 | T2/89 | Chuyển nhượng vốn TNCN | 10% | Luật 109 Đ13: **20%** trên (giá bán−mua−CP) |
| 3 | T3/62 | Hoàn thuế GTGT | Cơ chế hoàn 12 tháng | Luật 48/2024 + NĐ 181: **vẫn giữ** hoàn sau 12 tháng/4 quý |
| 4 | T4/82 | Thuế suất dầu khí | 32%–50% (luật 14/2008) | Luật 67/2025 Đ10: **25%–50%** (đã đối chiếu nguồn gốc) |

→ Quy tắc "vault đúng thì không sửa" áp dụng: **giữ nguyên cả 4, đợi bộ chuẩn cập nhật theo luật 2026**.

---

## 3. UNION ⚠️ — VAULT THIẾU (gop 3 đợt, bổ sung 1 lần)

> Mỗi mục = 1 lỗ hổng vault, với **con số/quy tắc thiếu** và **các đợt đã flag** (T2/T3/T4). Bổ sung từ nguồn gốc `sources/*.docx` (NĐ 320/360, Thông tư 99/2025, luật chuyên ngành).

### A. TNDN — ngưỡng & quy tắc chi trừ / ưu đãi (lặp nhiếu nhất)
- **Khống chế lãi vay LK 30% EBITDA + chuyển kỳ sau ≤5 năm**: T2(86), T3(86), T4(23,24)
- **Phúc lợi nghỉ mát ≤01 tháng lương bình quân**: T2(16), T3(15), T4(25,26)
- **BH hưu trí tự nguyện ≤3tr/tháng/người**: T2(27), T4(27)
- **Lãi vay tương ứng vốn ĐL thiếu → không trừ**: T2(22), T4(22)
- **Thù lao HĐQT không trực tiếp điều hành → không trừ**: T2(41), T4(55)
- **Lương chủ DN 1TV → không trừ**: T2(37)
- **Tạm nộp TNDN ≥80% quyết toán**: T4(61)
- **Chuyển lỗ ≤5 năm liên tục**: T2(15), T4(62)
- **Ưu đãi KCNNC / chip bán dẫn (miễn 4n, giảm 50% 9n; 10%/15n)**: T2(33), T3(67), T4(60,87)
- **Đầu tư mở rộng tăng ≥20% công suất**: T2(92), T3(68)
- **Thuê quản lý casino >4% doanh thu → không trừ**: T2(88), T4(88)
- **Miễn HTX nông nghiệp DVKT**: T2(61)
- **Tài trợ y tế (máy thở) được trừ**: T4(83)
- **Tài trợ giáo dục thiếu biên bản → không trừ**: T4(56)
- **Chi khám phụ khoa LĐ nữ giảm trực tiếp thuế**: T2(5), T4(84)
- **150% lãi suất cơ bản NHNN**: T2(25)
- **ESOP cổ phiếu thưởng (thuế TNCN)**: T2(19,40)
- **Dự phòng tiền lương 17% & không lỗ**: T2(44), T2(64)

### B. GTGT — tình huống & thời điểm cụ thể
- **Kho bạc khấu trừ 1% XDCB vốn NS**: T2(21), T3(75), T4(73,74)
- **Giá tính hàng biếu tặng / trả lương bằng hiện vật**: T2(95), T4(16,47)
- **GTGT casino = (DT−trả thưởng)×10%**: T2(38)
- **Viễn thông tỉnh khác 2%**: T2(48)
- **Bưu chính nội địa/quốc tế 10%**: T2(77), T4(43)
- **Hàng trả góp (giá tính không gồm lãi)**: T2(76)
- **Cá nhân không KD bán xe cũ không chịu GTGT**: T2(59), T3(99)
- **Phần mềm / KPTQ 0%**: T2(55), T4(93,94)
- **Xe ô tô thanh lý chịu GTGT 10%**: T2(99)
- **Thời điểm tính GTGT dịch vụ / sàn TMĐT nước ngoài**: T3(58), T4(71)
- **Mua hàng nông dân tự SX → không khấu trừ**: T4(45)
- **Nạo vét kênh mương phục vụ NN 5%**: T4(44)
- **Hàng NK hư hỏng thiên tai giảm thuế**: T4(48)
- **GTGT trực tiếp: DT tính TNDN gồm cả thuế**: T4(30)

### C. TTĐB — biểu thuế cụ thể (vault chỉ có khung/mức CP)
- **Vũ trường 40%**: T2(79)
- **Xe xăng + sinh học 50%**: T2(86)
- **Xe ô tô 16 chỗ 15%**: T2(91)
- **Golf 20%**: T2(98)
- **Máy bay phun thuốc trừ sâu không chịu**: T2(74)
- **Đá thạch anh XK 5–30%**: T2(47), T4(92)
- **Bia bán đơn vị phụ thuộc (giá tính)**: T4(41)
- **Tạm NK hội chợ quá hạn tái xuất**: T4(42)
- **Giá tính TTĐB hàng NK = GTNK+ThuếNK+ThuếNKBổsung**: T4(40)

### D. TNCN — thời điểm & tình huống
- **BĐS hình thành trong tương lai (thời điểm)**: T4(38)
- **Quà tặng chứng khoán (thời điểm)**: T3(100)
- **Năm đầu cư trú 12 tháng liên tục**: T3(31)
- **Thừa kế <50.000đ không hoàn**: T2(26), T3(33)
- **Lương làm ban đêm cao hơn → miễn phần cao**: T3(45)
- **Thuyền viên miễn**: T3(46)
- **DT ngưỡng miễn KD sàn TMĐT**: T2(83)
- **Bản quyền 10% DN nước ngoài**: T2(84)
- **Tiền nhà trả hộ tính toàn bộ thực chi (2026)**: T4(98)

### E. Hộ KD / Quản lý thuế / Mã số thuế
- **Sáp nhập HKD → chấm dứt MST hộ bị sáp nhập**: T2(30)
- **Hạn quyết toán TNDN = cuối tháng thứ 3**: T2(68), T4(50)
- **Phân bổ DT trả trước nhiều năm**: T2(69), T4(32)
- **HKD vượt 01tỷ → HĐĐT trong 30 ngày**: T2(49), T3(73), T4(76)
- **HKD đổi địa điểm giữ nguyên MST**: T4(54)
- **Hạn thông báo DT HKD nộp theo năm (31/01 năm sau)**: T3(72)
- **ID khoản phải nộp (thời điểm cấp)**: T4(78)
- **Hoàn thuế trước 06 ngày làm việc**: T3(23), T4(79)
- **Không chuyển dữ liệu HĐĐT → nghiêm cấm + xử phạt**: T3(76)
- **MST 10 số / 13 số cấu trúc (DN, chi nhánh, cá nhân chết)**: T3(77,78,79,80,82), T4(52,100)
- **Lỗi hạ tầng NNT → miễn chậm nộp**: T3(11), T4(81)
- **Gia hạn nộp khi HT cơ quan thuế sự cố (ngày tiếp theo liền kề)**: T3(12)

### F. Kế toán / Thông tư 99/2025 (Test4 nặng)
- **TK 337 cho HĐ dịch vụ / tiền ứng trước / tích điểm KH**: T4(2,19)
- **Giá bán đứng độc lập phân bổ HĐ nhiều nghĩa vụ**: T4(3)
- **Giá trị có thể thu hồi = cao hơn (GTHL−CPbán) và (GTSĐ)**: T4(4)
- **Chi phí môi giới CK kinh doanh → TK 635**: T4(5)
- **Sáp nhập KSC: TK 4118, kết chuyển 421 tối đa 10 năm**: T4(6)
- **IFRS 15: chuyển TS phát sinh HĐ → nợ phải thu khi vô điều kiện**: T4(7)
- **TSCĐ trả chậm: nguyên giá = giá mua trả tiền ngay**: T4(8)
- **Lãi ngầm định trả chậm mua TSCĐ: Nợ 635/Có 331 (hoặc 241)**: T4(9)
- **TS sinh học: chi chăm sóc không tăng lợi ích → CP SXKD**: T4(10,11)
- **Hỗ trợ NS hình thành TSCĐ: Nợ 3387/Có 711**: T4(13)
- **Hoàn nguyên môi trường: vốn hóa NG + chiết khấu Nợ 635/Có 352**: T4(14,15), T3(93)
- **Trả lương bằng SP: Nợ 334/Có 511,3331**: T4(16)
- **Đánh giá lại ngoại tệ: lãi→thu nhập khác; tiền mặt→không tính TNDN**: T4(17,18)
- **Đào tạo trước HĐ: TK 242, phân bổ ≤03 năm**: T4(20)
- **Trích trước sửa chữa không chi hết → giảm CP được trừ/hoàn nhập**: T4(21)
- **TSCĐ dừng <12 tháng vẫn khấu hao**: T4(89)
- **Bỏ trích trước sửa chữa lớn, dùng TK 242**: T3(29), T4(91)
- **Máy tính Quỹ PTKHCN → không khấu hao/trừ**: T2(80), T4(90)
- **Bút toán tiền phạt thuế: Nợ 811/Có 3339**: T4(95)
- **Sáp nhập → chênh lệch TS thuần → thuế hoãn lại**: T3(28)

### G. Giao dịch liên kết (nd-255-2026 còn sơ lược)
- **Khống chế 30% EBITDA**: T2(86), T3(86), T4(23)
- **Chuyển kỳ sau ≤05 năm**: T2(87), T3(87), T4(24)
- **Tổ chức tín dụng không áp dụng khống chế**: T2(88), T3(88)
- **Báo cáo lợi nhuận liên quốc gia từ 18.000tỷ**: T2(89), T3(89)
- **Kê khai cùng quyết toán TNDN năm**: T2(90), T3(90)

### H. XNK & Doanh nghiệp / LPTB
- **Đá khối XK khung 5–30%**: T2(47), T4(92)
- **Giảm thuế NK thiên tai (tỷ lệ tổn thất)**: T4(48)
- **Tài sản góp vốn không chịu LPTB**: T3(53)
- **DN xã hội dùng ≥51% lợi nhuận tái đầu tư**: T3(54)
- **Công ty hợp danh bắt buộc ≥02 TV hợp danh là cá nhân**: T3(55)

---

## 4. KẾT LUẬN & ĐỀ XUẤT

1. **Vault ổn định ở tầng tổng (cheatsheet + luật/nghị định gốc)**: 3 đợt Test2–4 khớp **140/300** câu ở mức chi tiết, và **chỉ 4 câu ❌ đều là vault đúng luật 2026** (đề sai do luật cũ). → Vault làm thước đo tốt, không cần sửa các câu ❌.
2. **155 câu ⚠️ là vault thiếu chi tiết**, tập trung: (a) Thông tư 99/2025 kế toán/hạch toán (Test4); (b) ngưỡng TNDN cụ thể (30% EBITDA, phúc lợi, BH hưu trí, casino 4%…); (c) biểu thuế TTĐB/XK cụ thể; (d) mã số thuế & thủ tục quản lý.
3. **Đề xuất bổ sung vault 1 lần** theo 8 nhóm A–H trên (dùng nguồn gốc `sources/`): ưu tiên nhóm **A (TNDN)** và **F (Thông tư 99)** vì lặp nhiều nhất qua 3 đợt.
4. **Chưa làm** (chờ user chốt): bổ sung 155 câu ⚠️ vào vault. Có thể làm từng nhóm A→H.

> Ghi chú: Test1 (100/100) là baseline đã đồng bộ mốc 01tỷ; Test2 là đợt "dơ" nhất do đề dùng luật cũ 2024 trở về trước (nên ❌/⚠️ cao). Test3/Test4 đã chuẩn 2026 nên sạch hơn.
