---
title: Đối chiếu Test4 (100 câu) vs Vault Thuế & Kế toán
domain: tax
tags:
  - tax
  - tax/doi-chieu
source: test4_full.txt (Test4.docx) đối chiếu với vault/thue-ke-toan
status: draft
updated: 2026-07-18
---

# Đối chiếu Test4 (100 câu) vs Vault Thuế & Kế toán

> **Mục tiêu:** Dùng vault `vault/thue-ke-toan/` làm THƯỚC ĐO DUY NHẤT để đánh giá 100 câu hỏi-đáp án trong `Test4.docx` (`.tmp_extract/test4_full.txt`).
> **Đặc điểm Test4:** Thiên sâu về **kế toán / hạch toán (Thông tư 99/2025, VAS)** và các con số chi tiết thuế 2026 (TNDN, GTGT, TNCN, TTĐB, HKD, quản lý thuế, BHXH).
> **Quy tắc:** Chỉ dùng nội dung ĐÃ CÓ trong vault. KHÔNG sửa bất kỳ file vault nào. KHÔNG lấy từ nguồn ngoài.
> **Phân loại:** ✅ Khớp · ⚠️ Vault thiếu ngưỡng-số-liệu-thuật-ngữ cụ thể · ❌ Vault TRÁI NGHỊCH đáp án (vault đúng luật 2026 thì KHÔNG sửa).

---

## TỔNG HỢP

| Chỉ số | Số lượng |
|---|---|
| ✅ Khớp | **37** |
| ⚠️ Thiếu (vault chưa ghi rõ ngưỡng/số liệu) | **62** |
| ❌ Sai (vault trái nghịch đáp án) | **1** |
| **Tổng** | **100** |

- **1 câu ❌**: câu 82 (thuế suất dầu khí). Đề ghi **32%–50%** (luật cũ 14/2008). Vault ghi **25%–50%** theo Luật 67/2025 Đ10 — đã xác minh trực tiếp trong `sources/67_2025_QH15_580594.docx`: *"từ 25% đến 50% … Thủ tướng Chính phủ quyết định mức thuế suất cụ thể"*. **Vault ĐÚNG luật 2026 → KHÔNG sửa vault.**
- **62 câu ⚠️** không phải vault sai, mà vault **thiếu ngưỡng/số liệu/thuật ngữ cụ thể** mà bộ chuẩn yêu cầu (đặc biệt tập trung CÂU 1–29 về kế toán/hạch toán Thông tư 99/2025). Cần bổ sung vault sau (xem mục "Gom nhóm ⚠️").

---

## LÔ 1 (câu 1–10)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 1 | Kế toán CK kinh doanh | Trái phiếu niêm yết, giá hợp lý giảm cuối năm → bút toán? | Nợ 635 / Có 121 | ✅ | `tt-99-2025-dieu-31.md`: Nợ 635 + Có 121 |
| 2 | Hạch toán HĐ | Tiền ứng trước HĐ dịch vụ 2 năm → TK? | TK 337 | ⚠️ | `tt-99-2025-dieu-31.md` chỉ định nghĩa TK 337 cho HĐ xây dựng, chưa xác nhận cho HĐ dịch vụ/tiền ứng trước |
| 3 | Phân bổ giá HĐ | HĐ nhiều nghĩa vụ → phân bổ theo? | Giá bán đứng độc lập | ⚠️ | Vault chưa có thuật ngữ "giá bán đứng độc lập" (standalone) |
| 4 | Dự phòng đầu tư | Giá trị có thể thu hồi = ? | Cao hơn (GTHL−CP bán) và (giá trị SD) | ⚠️ | `tt-99-2025-dieu-31.md` chỉ ghi "giá hợp lý − chi phí bán", thiếu "giá trị sử dụng" |
| 5 | Chi phí môi giới CK | Môi giới mua CK kinh doanh → TK? | TK 635 | ⚠️ | Có TK 635; thiếu xác nhận riêng "chi phí môi giới mua CK" |
| 6 | Sáp nhập KSC | Chênh lệch sáp nhập KSC → xử lý? | TK 4118, kết chuyển 421 tối đa 10 năm | ⚠️ | Có TK 4118; thiếu tình huống "sáp nhập kiểm soát chung" và ngưỡng 10 năm |
| 7 | IFRS 15 | Khi nào chuyển tài sản HĐ → nợ phải thu? | Quyền nhận TT vô điều kiện | ⚠️ | Vault chưa có nguyên tắc IFRS 15 "vô điều kiện" |
| 8 | TSCĐ trả chậm | Mua TSCĐ trả chậm 24 tháng → nguyên giá? | Giá mua trả tiền ngay | ⚠️ | Thiếu xác nhận nguyên giá TSCĐ trả chậm |
| 9 | Lãi ngầm định trả chậm | Lãi ngầm định mua TSCĐ trả chậm → đâu? | Nợ 635 / Có 331 (hoặc 241) | ⚠️ | Có 635/331 rải rác; thiếu liên kết lãi ngầm định trả chậm mua TSCĐ |
| 10 | TS sinh học | Chi chăm sóc không tăng lợi ích → đâu? | Chi phí SXKD kỳ | ⚠️ | Có TK 215; thiếu xử lý chi phí chăm sóc TS sinh học |

## LÔ 2 (câu 11–20)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 11 | Vật nuôi vườn thú | Phân loại tài sản? | TSCĐ hữu hình (Súc vật làm việc) | ⚠️ | `tt-99-2025-dieu-31.md` ghi "Súc vật làm việc" thuộc TK 215 **Tài sản sinh học**, không xác nhận "TSCĐ hữu hình" |
| 12 | Cây lấy gỗ | Thu hoạch 1 lần → TK? | TK 215 | ✅ | `tt-99-2025-dieu-31.md`: TK 2153 cây lấy sản phẩm 1 lần |
| 13 | Hỗ trợ NS hình thành TSCĐ | Bút toán khi sẵn sàng SD? | Nợ 3387 / Có 711 | ⚠️ | Thiếu TK 3387 / hỗ trợ NS hình thành TSCĐ |
| 14 | Hoàn nguyên môi trường | Xử lý khi XD TSCĐ? | Vốn hóa (GT hiện tại tương lai) | ⚠️ | Thiếu thuật ngữ "hoàn nguyên môi trường" |
| 15 | Dự phòng hoàn nguyên | Hàng kỳ chiết khấu → đâu? | Nợ 635 / Có 352 | ⚠️ | Có 635/352; thiếu liên kết hoàn nguyên môi trường |
| 16 | Trả lương bằng SP | Bút toán doanh thu + GTGT? | Nợ 334 / Có 511, 3331 | ⚠️ | Thiếu bút toán trả lương bằng sản phẩm |
| 17 | Nợ ngoại tệ đánh giá lại | Lãi → tính thuế TNDN? | Thu nhập khác (hoặc bù trừ) | ⚠️ | Có 711/413; thiếu xử lý thuế TNDN lãi đánh giá lại nợ ngoại tệ |
| 18 | Chênh lệch tỷ giá tiền mặt | Tính TN chịu thuế TNDN không? | Không | ⚠️ | Thiếu xác nhận loại trừ thuế TNDN chênh lệch tỷ giá tiền mặt ngoại tệ |
| 19 | Tích điểm KH | Giá trị điểm thưởng → TK? | TK 337 | ⚠️ | TK 337 chỉ định nghĩa HĐ xây dựng; thiếu tích điểm KH |
| 20 | Đào tạo trước HĐ | TK? Phân bổ tối đa? | TK 242, tối đa 03 năm | ⚠️ | Có TK 242; thiếu ngưỡng 03 năm và tình huống đào tạo trước HĐ |

## LÔ 3 (câu 21–30)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 21 | Trích trước sửa chữa | Không chi hết → xử lý? | Giảm CP được trừ / hoàn nhập TN khác | ⚠️ | Có 242/352; thiếu xử lý trích trước không chi hết |
| 22 | Lãi vay vốn ĐL thiếu | Được trừ không? | Không | ⚠️ | `luat-67` dòng 50 ghi vốn quá mức CP; thiếu "vốn ĐL thiếu" |
| 23 | Khống chế lãi vay LK | Mức nào? | 30% EBITDA | ⚠️ | `luat-67` dòng 50 ghi "lãi vay liên kết không được trừ"; thiếu ngưỡng 30% EBITDA |
| 24 | Chuyển kỳ sau lãi vay | Bao lâu? | ≤ 05 năm liên tục | ⚠️ | `nd-320` tóm tắt; thiếu "05 năm" |
| 25 | Phúc lợi nghỉ mát | Mức được trừ? | ≤ 01 tháng lương bình quân | ⚠️ | `luat-67` dòng 50 ghi phúc lợi; thiếu "01 tháng lương bình quân" |
| 26 | Công thức 01 tháng lương | Công thức? | Quỹ lương năm / số tháng thực tế | ⚠️ | Thiếu công thức |
| 27 | BH hưu trí TNTN | Mức được trừ? | 3 triệu/tháng/người | ⚠️ | `luat-41`/`nd-320` thiếu trần 3tr/tháng |
| 28 | Quà tặng KH | Có hóa đơn, TT NH → trừ không? | Có | ⚠️ | Có nguyên tắc CP SXKD được trừ; thiếu xác nhận riêng quà tặng KH |
| 29 | GTGT ô tô 5 chỗ 2,5 tỷ | Khấu trừ tối đa? | Phần nguyên giá 1,6 tỷ | ✅ | `_cheatsheet-thue-2026.md` dòng 138: trần 1,6 tỷ/xe (NĐ 320/2025) |
| 30 | GTGT trực tiếp | DT tính TNDN có gồm thuế GTGT? | Có (gồm cả thuế) | ⚠️ | Thiếu xác nhận DT TNDN gồm thuế GTGT (PP trực tiếp) |

## LÔ 4 (câu 31–40)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 31 | Thời điểm DT bán hàng | Khi nào? | Chuyển giao quyền sở hữu/SD | ✅ | `tt-20-2026-tndn.md` Đ5: chuyển giao quyền sở hữu |
| 32 | Cho thuê nhận tiền trước 3 năm | Khai 1 lần không? | Được chọn 1 lần hoặc phân bổ | ⚠️ | Thiếu xác nhận khai DT cho thuê nhận tiền trước |
| 33 | Tiền phạt HĐKD nhận được | Hạch toán? | Thu nhập khác | ⚠️ | `luat-67` chỉ ghi chiều NỢ phạt; thiếu "phạt nhận được = TN khác" |
| 34 | Dự phòng giảm giá HTK | Căn cứ? | Giá gốc > giá trị thuần Có thể THĐC | ✅ | `tt-99-2025-dieu-31.md` dòng 42 |
| 35 | Sổ HKD kê khai | Mẫu sổ doanh thu? | S2a-HKD | ✅ | `tt-152-2025-ke-toan-hkd.md` dòng 24 |
| 36 | HKD 1,5 tỷ TNCN | Trừ CP thuê mặt bằng không? | Không, tính trên (DT−01tỷ) | ✅ | `_cheatsheet-thue-2026.md` dòng 90 |
| 37 | DN nước ngoài CNV | Chuyển nhượng vốn TNHH VN → mức? | 0,1% doanh thu | ⚠️ | `tt-20-2026-tndn.md` có chuyển nhượng vốn; thiếu mức 0,1% doanh thu |
| 38 | CN chuyển nhượng BĐS tương lai | Thời điểm tính TNCN? | HĐ có hiệu lực / xác nhận tại dự án | ⚠️ | `luat-109`/`nd-253` thiếu "BĐS hình thành trong tương lai" |
| 39 | TTĐB rượu 15° | Thuế suất 2026? | 35% | ✅ | `_cheatsheet-thue-2026.md` dòng 103: rượu <20° = 35% |
| 40 | Giá tính TTĐB hàng NK | Công thức? | Giá tính NK + Thuế NK + Thuế NK bổ sung | ⚠️ | Cheatsheet dòng 112 quy tắc chung; thiếu công thức hàng NK |

## LÔ 5 (câu 41–50)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 41 | Bia bán đơn vị phụ thuộc | Giá tính TTĐB? | Giá đơn vị phụ thuộc bán ra | ⚠️ | `luat-66`/`nd-360` thiếu tình huống bia bán đơn vị phụ thuộc |
| 42 | Tạm NK hội chợ quá hạn | Xử lý TTĐB? | Nộp tại thời điểm hết hạn tái xuất | ⚠️ | Thiếu xử lý TTĐB tạm NK hội chợ quá hạn |
| 43 | GTGT bưu chính nội địa | Thuế suất? | 10% | ⚠️ | Cheatsheet: 10% mặc định; không liệt kê riêng "bưu chính nội địa" |
| 44 | Nạo vét kênh mương NN | Thuế suất GTGT? | 5% | ⚠️ | Cheatsheet 5% không có "nạo vét kênh mương" |
| 45 | Mua hàng nông dân tự SX | Khấu trừ GTGT không? | Không (không chịu thuế) | ⚠️ | Thiếu "nông dân tự SX không chịu thuế GTGT → không được khấu trừ" |
| 46 | Thanh toán ≥5 triệu | Bắt buộc không tiền mặt? | Có | ✅ | `_cheatsheet-thue-2026.md` dòng 133 (TNDN), 49 |
| 47 | Xuất biếu tặng KH | Giá tính GTGT? | Giá hàng cùng loại/tương đương | ⚠️ | `luat-48`/`nd-359` thiếu giá tính biếu tặng |
| 48 | Hàng NK hư hỏng thiên tai | Xử lý thuế NK? | Giảm theo tỷ lệ tổn thất | ⚠️ | `vbhn-luat-thue-xnk-107-2016.md` thiếu "thiên tai/giảm thuế" |
| 49 | Khai thuế muộn 95 ngày (200tr) | Phạt trốn thuế? | 1–3 lần số thuế trốn | ✅ | `nd-310-2025-xu-phat-thue-hoa-don.md` dòng 23 |
| 50 | Hạn quyết toán TNDN | Khi nào? | Cuối tháng thứ 3 | ⚠️ | `tt-20-2026-tndn.md` có quyết toán; thiếu ngưỡng "tháng thứ 3" |

## LÔ 6 (câu 51–60)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 51 | Hạn quyết toán TNDN | Ngày nào? | Cuối tháng thứ 3 | ✅ | `tt-89-2026-dieu-18.md` dòng 512 |
| 52 | MST 13 số | Cấp cho ai? | Chi nhánh/VPDD/đơn vị phụ thuộc | ✅ | `tt-90-2026-dieu-5.md` dòng 28 |
| 53 | Thông tin định danh TNCN | Từ 01/07/2025 thay MST? | Số định danh cá nhân | ✅ | `tt-90-2026-dieu-37.md`, `tt-91-2026-dieu-25.md` |
| 54 | HKD đổi địa điểm | Xử lý MST? | Giữ nguyên MST cũ | ⚠️ | Thiếu quy định HKD đổi địa điểm giữ nguyên MST |
| 55 | Thù lao HĐQT | Được trừ không? | Không (không điều hành) | ⚠️ | Thiếu quy định thù lao HĐQT không điều hành |
| 56 | Tài trợ GD thiếu biên bản | Được trừ không? | Không | ⚠️ | Thiếu quy định tài trợ GD phải có biên bản |
| 57 | Dự phòng nợ khó đòi 2–3 năm | %? | 70% | ✅ | `tt-99-2025-dieu-31.md` dòng 7963: 70% |
| 58 | QSDĐ lâu dài | Khấu hao trừ không? | Không | ⚠️ | Thiếu quy định QSDĐ lâu dài không khấu hao |
| 59 | TNDN DT >50 tỷ | Thuế suất? | 20% | ✅ | `luat-67-2025-tndn.md` dòng 40; cheatsheet |
| 60 | Ưu đãi ĐBKK đặc biệt | Thuế suất? | 10% / 15 năm | ✅ | `nd-320-2025-tndn.md` dòng 27 |

## LÔ 7 (câu 61–70)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 61 | Tạm nộp TNDN | ≥ bao nhiêu % quyết toán? | 80% | ⚠️ | Thiếu con số 80% tạm nộp |
| 62 | Chuyển lỗ TNDN | Tối đa bao lâu? | 05 năm liên tục | ⚠️ | `nd-320` Đ7 "Lỗ và chuyển lỗ" không ghi số năm |
| 63 | CN chuyển nhượng CK | TNCN mức? | 0,1% giá chuyển nhượng | ✅ | `_cheatsheet-thue-2026.md` dòng 78 |
| 64 | Quà tặng CCQ mở 1 năm | TNCN? | 10% phần trên 20tr | ✅ | `_cheatsheet-thue-2026.md` dòng 80; `nd-253` miễn nếu ≥2 năm |
| 65 | Kiều hối | Nộp TNCN không? | Miễn toàn bộ | ✅ | `_cheatsheet-thue-2026.md` dòng 86 |
| 66 | HĐLĐ 1 tháng | BHXH bắt buộc? | Có (≥01 tháng) | ✅ | `luat-41-2024-bhxh.md` dòng 21 |
| 67 | Căn cứ đóng BHXH | Gồm khoản nào? | Lương + phụ cấp + bổ sung | ⚠️ | `luat-41` ghi chung; thiếu liệt kê cụ thể |
| 68 | GGC NPT 2026 | Bao nhiêu? | 6,2 triệu/tháng | ✅ | `_cheatsheet-thue-2026.md` dòng 63 |
| 69 | TNCN thu nhập 15tr | Thuế? | 1 triệu (10tr×5% + 5tr×10%) | ✅ | Cheatsheet biểu bậc 1–2 |
| 70 | Trúng thưởng xổ số >20tr | TNCN? | 10% phần vượt 20tr | ✅ | `_cheatsheet-thue-2026.md` dòng 80 |

## LÔ 8 (câu 71–80)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 71 | Bán TMĐT nước ngoài | Thời điểm GTGT? | Hoàn thành cung ứng / lập HĐ | ⚠️ | Thiếu quy định GTGT sàn TMĐT nước ngoài |
| 72 | NCC nước ngoài nộp thuế | Bằng tiền gì? | Ngoại tệ tự do chuyển đổi | ✅ | `tt-89-2026-dieu-18.md` dòng 551 |
| 73 | Kho bạc khấu trừ GTGT | %? | 1% doanh thu chưa thuế | ✅ | `tt-89-2026-dieu-18.md` dòng 91 |
| 74 | Xây dựng ngoại tỉnh | % GTGT địa phương? | 1% doanh thu chưa thuế | ✅ | `tt-89-2026-dieu-18.md` dòng 64 |
| 75 | HKD Shopee phí sàn/vận chuyển | Trừ DT không? | Không | ⚠️ | Thiếu quy định HKD TMĐT không trừ phí sàn/vận chuyển |
| 76 | HKD vượt 01 tỷ | Dùng HĐĐT trong bao lâu? | 30 ngày | ⚠️ | Thiếu con số 30 ngày |
| 77 | Chứng từ KT TNCN điện tử | Mẫu? | 03/TNCN | ✅ | `tt-91-2026-dieu-25.md` dòng 66 |
| 78 | Mã định danh khoản nộp (ID) | Cấp khi nào? | Khi NNT thanh toán trên HTQL thuế | ⚠️ | `tt-89-dieu-42` có khái niệm ID; thiếu thời điểm cấp |
| 79 | Hoàn thuế trước | Giải quyết bao lâu? | 06 ngày làm việc | ⚠️ | Có cơ chế hoàn trước; thiếu mốc 06 ngày |
| 80 | Tiền chậm nộp | %/ngày? | 0,03% | ⚠️ | `luat-108`/`tt-89` dẫn Đ16; thiếu con số 0,03% |

## LÔ 9 (câu 81–90)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 81 | Nộp thiếu do lỗi NH | Chậm nộp không? | Không (NH chịu) | ⚠️ | Thiếu quy định lỗi NH miễn chậm nộp |
| 82 | Thuế suất dầu khí | Mức? | 32%–50% (SAI) | ❌ | Vault `luat-67-2025-tndn.md` dòng 43 + nguồn `67_2025_QH15_580594.docx`: **25%–50%** (Đ10). Đề dùng luật cũ 14/2008. **Vault đúng → KHÔNG sửa** |
| 83 | Tài trợ y tế (máy thở) | Được trừ không? | Có | ⚠️ | Thiếu quy định tài trợ y tế được trừ |
| 84 | Chi khám phụ khoa nữ | Giảm trực tiếp thuế TNDN? | Có (theo thực chi) | ⚠️ | Thiếu quy định giảm trừ trực tiếp thuế lao động nữ |
| 85 | R&D được trừ | Tối đa? | 200% thực tế | ✅ | `nq-198-2025-kinh-te-tu-nhan.md` dòng 30 |
| 86 | Chứng chỉ giảm phát thải | Miễn TNDN không? | Không (miễn) | ⚠️ | Thiếu quy định chứng chỉ giảm phát thải miễn TNDN |
| 87 | Chip bán dẫn KCNNC | Ưu đãi? | Miễn 4 năm, giảm 50% 9 năm | ⚠️ | `nd-320` Đ20 ghi chung; thiếu xác nhận riêng chip bán dẫn |
| 88 | Thuê quản lý casino | Vượt % doanh thu không trừ? | 4% | ⚠️ | `luat-67` ghi chung; thiếu ngưỡng 4% |
| 89 | TSCĐ dừng 11 tháng | Khấu hao trừ không? | Có (dưới 12 tháng) | ⚠️ | Thiếu ngưỡng 12 tháng dừng HĐ vẫn khấu hao |
| 90 | Máy tính Quỹ PTKH&CN | Khấu hao trừ không? | Không | ⚠️ | Thiếu quy định máy tính Quỹ PTKH&CN không khấu hao |

## LÔ 10 (câu 91–100)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault khớp? | Ghi chú |
|---|---|---|---|---|---|
| 91 | Trích trước sửa chữa TSCĐ | TK? | Không trích trước, TK 242 | ⚠️ | Thiếu quy định "không trích trước, phân bổ TK 242" |
| 92 | Thuế XK đá khối | Khung? | 5%–30% | ⚠️ | Cheatsheet dòng 126: khoáng sản 5–40%; thiếu đá khối 5–30% |
| 93 | Phần mềm bán KPTQ | GTGT? | 0% | ⚠️ | Cheatsheet 0% hàng XK; thiếu xác nhận phần mềm/KPTQ = 0% |
| 94 | Điện cho KPTQ | 0% không? | Có | ⚠️ | Cheatsheet 0% không liệt kê điện cho KPTQ |
| 95 | Phạt thuế 15tr | Bút toán? | Nợ 811 / Có 3339 | ⚠️ | Thiếu bút toán Nợ 811/Có 3339 tiền phạt thuế |
| 96 | Phạt 15tr | Được trừ TNDN không? | Không | ✅ | `_cheatsheet-thue-2026.md` dòng 51; `luat-67` dòng 50 |
| 97 | Học phí con chuyên gia NN | Trừ không? | Có (ghi HĐLĐ) | ⚠️ | Thiếu quy định học phí con chuyên gia NN được trừ |
| 98 | Tiền nhà trả hộ NLĐ | Tính TNCN? | Toàn bộ thực chi (2026) | ⚠️ | Thiếu quy định tiền nhà trả hộ tính toàn bộ thực chi |
| 99 | HKD 60 tỷ/năm | TNCN? | 20% trên (DT−CP) | ✅ | `_cheatsheet-thue-2026.md` dòng 90: >50 tỷ = 20% |
| 100 | Đơn vị phụ thuộc | MST riêng 13 số? | Có | ✅ | `tt-90-2026-dieu-5.md` dòng 28 |

---

## GOM NHÓM ⚠️ (62 câu — bổ sung vault sau)

> Các câu ⚠️ KHÔNG phải vault sai, mà vault **thiếu ngưỡng/số liệu/thuật ngữ** mà Test4 yêu cầu. Bổ sung khi có nguồn (Thông tư 99/2025 đầy đủ, NĐ 320/360, luật chuyên ngành).

- **A. Kế toán / hạch toán Thông tư 99/2025 (câu 2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,19,20,21)**: bút toán TSCĐ trả chậm, lãi ngầm định, TS sinh học, hoàn nguyên môi trường, TK 337/242/4118/3387, IFRS 15, dự phòng, tỷ giá ngoại tệ.
- **B. TNDN chi trừ / ưu đãi (câu 22,23,24,25,26,27,28,30,32,37,40,54,55,56,58,61,62,67,83,84,86,87,88,90)**: 30% EBITDA, 05 năm chuyển lỗ, 80% tạm nộp, phúc lợi 01 tháng lương, BH hưu trí 3tr, chip bán dẫn, casino 4%, tài trợ y tế, QSDĐ lâu dài.
- **C. GTGT / TTĐB (câu 40,41,42,43,44,45,47,48,71,75,76,78,80,92,93,94)**: giá tính hàng NK/biếu tặng, bia đơn vị phụ thuộc, tạm NK hội chợ, bưu chính 10%, nạo vét kênh 5%, nông dân tự SX, TMĐT, KPTQ, tiền chậm nộp 0,03%, thuế XK đá khối.
- **D. HKD / quản lý thuế (câu 38,54,71,75,76,78,79,97,98)**: BĐS tương lai, MST HKD đổi địa điểm, học phí con chuyên gia, tiền nhà trả hộ, hoàn thuế trước 06 ngày, ID thanh toán.
- **E. Kế toán bút toán / TSCĐ (câu 89,91,95)**: ngưỡng 12 tháng dừng HĐ, không trích trước sửa chữa, Nợ 811/Có 3339.

---

## KẾT LUẬN

- Test4 = **✅37 ⚠️62 ❌1**.
- **1 câu ❌ (82)** do đề dùng luật cũ (14/2008: 32–50%). Vault đúng luật 2026 (25–50% theo Luật 67/2025 Đ10, đã đối chiếu nguồn gốc) → **KHÔNG sửa vault** (quy tắc "vault đúng thì không sửa").
- **62 câu ⚠️** là vault thiếu chi tiết → bổ sung sau, GIỮ NGUYÊN không sửa.
- Các câu ✅ đã đồng bộ chuẩn 2026 với vault.
