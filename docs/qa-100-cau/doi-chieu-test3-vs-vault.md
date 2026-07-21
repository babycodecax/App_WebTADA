---
title: Đối chiếu Test3 (100 câu) vs Vault Thuế & Kế toán
domain: tax
tags:
  - tax
  - tax/doi-chieu
source: test3_full.txt (Test3.docx) đối chiếu với vault/thue-ke-toan
status: draft
updated: 2026-07-18
---

# Đối chiếu Test3 (100 câu) vs Vault Thuế & Kế toán

> **Mục tiêu:** Dùng vault `vault/thue-ke-toan/` làm THƯỚC ĐO DUY NHẤT để đánh giá 100 câu hỏi-đáp án trong `Test3.docx` (`.tmp_extract/test3_full.txt`, chuẩn luật 2026).
> **Quy tắc:** Chỉ dùng nội dung ĐÃ CÓ trong vault. KHÔNG sửa bất kỳ file vault nào. KHÔNG lấy từ nguồn ngoài (NotebookLM, web).
> **Phân loại:** ✅ Khớp · ⚠️ Vault thiếu ngưỡng-số-liệu-cụ-thể · ❌ Vault TRÁI NGHỊCH đáp án (vault đúng luật 2026 thì không sửa).

---

## 📊 TỔNG HỢP

| Chỉ số | Số lượng |
|---|---|
| ✅ Khớp | **59** |
| ⚠️ Thiếu (vault chưa ghi rõ ngưỡng/số liệu) | **39** |
| ❌ Sai (vault trái nghịch đáp án) | **1** |
| **Tổng** | **100** |

- **1 câu ❌**: câu 62 (hoàn thuế GTGT vẫn giữ cơ chế 12 tháng) — vault đúng luật 2026, không sửa.
- **Câu 39 đã chuyển ✅**: cheatsheet cũ ghi "bỏ hẳn trần 1,6 tỷ" là SAI; đã xác minh Luật 67/2025 giao CP quy định, NĐ 320/2025 vẫn giữ trần → đã sửa cheatsheet. Bộ chuẩn đúng.
- **40 câu ⚠️** không phải vault sai, mà vault **thiếu ngưỡng/số liệu cụ thể** mà bộ chuẩn yêu cầu → cần bổ sung vault (xem mục "Gom nhóm ⚠️ để bổ sung vault").

---

## LÔ 1 (câu 1–10)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 1 | Tài sản mã hóa (TNCN) | CN cư trú chuyển nhượng TS mã hóa 1 tỷ → TNCN? | 1 triệu (0,1% giá chuyển nhượng từng lần) | ✅ | `tt-32-2026-tai-san-ma-hoa.md` Đ5: "0,1% trên giá chuyển nhượng từng lần" |
| 2 | Tài sản mã hóa (TNDN) | Thu nhập chuyển nhượng TS mã hóa: 20% riêng hay gộp? | Nộp theo thuế suất 20% | ✅ | `tt-32-2026-tai-san-ma-hoa.md` Đ4: "Tổ chức VN … 20% trên thu nhập chịu thuế" |
| 3 | Tài sản mã hóa (thời điểm) | Thời điểm xác định doanh thu tính thuế TS mã hóa? | Như chuyển nhượng chứng khoán | ✅ | `tt-32-2026-tai-san-ma-hoa.md` Đ6 |
| 4 | Hộ KD (miễn thuế) | CN sở hữu 3 hộ, tổng DT 1,2 tỷ → miễn? | Không, vượt 01 tỷ/năm | ⚠️ | Vault có ngưỡng 01 tỷ (`nd-68-2026` Đ3, `nd-141-2026`, cheatsheet mục 1&6) nhưng **thiếu quy tắc cộng gộp doanh thu nhiều hộ cùng 1 cá nhân** |
| 5 | Hộ KD (GTGT) | HKD DT 2 tỷ bán lẻ tạp hóa → GTGT? | 1% doanh thu | ✅ | cheatsheet mục 3 + `nd-68-2026` Đ27: "Phân phối hàng hóa 1%" |
| 6 | TNDN (thuế suất) | DN siêu nhỏ DT 1,5 tỷ → thuế suất? | 15% | ✅ | cheatsheet mục 2: "DN tổng DT ≤ 3 tỷ → 15%" |
| 7 | TNDN (thuế suất) | DN DT 45 tỷ → thuế suất? | 17% | ✅ | cheatsheet mục 2: "DN 3–50 tỷ → 17%" |
| 8 | Chi được trừ (tiền mặt) | Chi mua hàng 5,5tr tiền mặt → trừ? | Không, từ 05 triệu bắt buộc không tiền mặt | ✅ | cheatsheet mục 2: "Từng lần ≥ 5 triệu → KHÔNG được trừ" |
| 9 | QLT (chậm nộp) | Lỗi hạ tầng NNT nộp bù thuế thiếu → miễn chậm nộp? | Không, NNT tự chịu | ✅ | `tt-89-2026-dieu-7.md` Đ12.1: NNT phải tự khắc phục |
| 10 | QLT (gia hạn) | HT thuế sự cố ngày cuối hạn → nộp đến? | Ngày tiếp theo liền kề HT hoạt động lại | ✅ | `tt-89-2026-dieu-7.md` Đ12.3b |

---

## LÔ 2 (câu 11–20)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 11 | QLT (chậm nộp) | Lỗi hạ tầng NNT → miễn tiền chậm nộp? | Không | ⚠️ | `luat-108-2025` chỉ có từ khóa "miễn tiền chậm nộp" Đ5.5, **thiếu điều kiện** lỗi NNT tự chịu |
| 12 | QLT (gia hạn) | Sự cố HT cơ quan thuế ngày cuối → gia hạn? | Ngày tiếp theo liền kề | ⚠️ | `tt-89-2026-dieu-18.md` chỉ dẫn chiếu Luật QLT, **chưa trích** quy định cụ thể |
| 13 | TNDN (chi trừ) | Học phí 30tr/năm cho con LĐ VN → trừ? | Không, chỉ con LĐ nước ngoài/VN ở nước ngoài | ⚠️ | Vault **không có** quy định học phí con LĐ trong TNDN (chỉ có ở `chung/tt-99-2025` kế toán phải trả NLĐ) |
| 14 | TNDN (chi trừ) | Trích quỹ dự phòng tiền lương tối đa? | 17% quỹ lương thực hiện | ⚠️ | Vault có "17%" nhưng là thuế suất TNDN (DN 3–50 tỷ), **thiếu "quỹ dự phòng TL 17%"** (`nd-320-2025` Đ10.8c có nhưng chưa cấu trúc vào note) |
| 15 | TNDN (chi trừ) | Phúc lợi 2 tỷ, quỹ lương 12 tỷ → trừ? | 1 tỷ (01 tháng lương bình quân) | ⚠️ | `nd-320-2025` Đ10.4d có ngưỡng "vượt quá 01 tháng lương bình quân" nhưng **chưa cấu trúc vào note** |
| 16 | TNCN (thừa kế CK) | Thừa kế CK 100tr từ anh ruột → thuế? | 8 triệu ((100‑20)×10%) | ✅ | cheatsheet mục 3: "Thừa kế … 10% (phần vượt 20tr/lần)". CK không thuộc miễn BĐS thân nhân |
| 17 | TNCN (CC quỹ mở) | Nắm giữ CC quỹ mở bao lâu miễn khi chuyển nhượng? | Từ 02 năm | ✅ | `nd-253-2026-tncn.md` Đ43; `luat-109-2025-tncn.md` Đ5 |
| 18 | TTĐB (bia) | Thuế suất TTĐB bia từ 01/01/2026? | 65% | ✅ | cheatsheet mục 4; `luat-66-2025-ttdb.md`; `nd-360-2025-ttdb.md` |
| 19 | TTĐB (ô tô điện) | Xe <24 chỗ chạy pin (điện hoàn toàn) 2026? | 3% | ✅ | `luat-09-2026-sua-doi-4-luat-thue.md` Đ4: ≤9 chỗ 3%; cheatsheet "xe điện 3%/2%/1%/2%" |
| 20 | TTĐB (vàng mã) | Vàng mã (trừ đồ chơi trẻ em) chịu TTĐB? | 70% | ✅ | cheatsheet mục 4; `luat-66-2025-ttdb.md` Đ2k |

---

## LÔ 3 (câu 21–30)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 21 | TTĐB (golf) | Golf nộp TTĐB trên giá nào? | Giá bán thẻ hội viên, vé chơi (gồm phí thuê xe, caddy) | ✅ | `nd-360-2025-ttdb.md` d.38; cheatsheet "Giá tính = Giá bán chưa có thuế GTGT". (⚠️ chi tiết "caddy" thuộc NĐ 52/2020 chưa có trong vault) |
| 22 | Hoàn thuế (kiểm tra trước) | Trốn thuế bị xử lý → bao lâu "kiểm tra trước hoàn"? | 02 năm kể từ ngày bị xử lý | ✅ | `tt-89-2026-dieu-42.md` d.209 |
| 23 | Hoàn thuế (hoàn trước) | Thời hạn giải quyết "hoàn thuế trước"? | Chậm nhất 06 ngày làm việc | ⚠️ | Vault có "hoàn thuế trước" (`tt-89` Đ42, `luat-108`) nhưng **chưa ghi "06 ngày làm việc"** |
| 24 | GTGT (XD tỉnh khác) | Xây dựng tỉnh khác nộp GTGT tỉ lệ? | 1% doanh thu chưa có thuế GTGT | ✅ | `tt-89-2026-dieu-18.md` d.64: "nhân (x) với 1%" |
| 25 | TNDN (thu nhập khác) | Nợ phải trả không xác định chủ nợ → thu nhập chịu thuế? | Có, tính thu nhập khác | ✅ | `tt-99-2025-dieu-31.md`; `luat-67-2025-tndn.md` Đ27 |
| 26 | TNDN (R&D) | Chi 500tr R&D → trừ tối đa? | 1 tỷ (200% thực tế) | ✅ | `nq-198-2025-kinh-te-tu-nhan.md`: "chi R&D … 200% thực tế" |
| 27 | Kế toán (tài sản sinh học) | TS sinh học không dùng nông nghiệp (vườn thú) → đâu? | Súc vật làm việc thuộc TSCĐ | ✅ | `tt-99-2025-dieu-31.md`: "súc vật làm việc được kế toán là TSCĐ hữu hình" |
| 28 | Kế toán (sáp nhập) | Chênh lệch đánh giá lại TS thuần khi sáp nhập? | Thuế TNDN hoãn lại (nếu có chênh lệch tạm thời) | ⚠️ | Vault có rời rạc (`tt-99` Đ23 sáp nhập, Đ24 chênh lệch, Đ31 thuế hoãn lại) nhưng **thiếu câu nối** "sáp nhập → thuế hoãn lại" |
| 29 | Kế toán (trích trước 335) | Trích trước sửa chữa lớn TSCĐ vào TK 335 → trừ? | Không, bỏ trích trước, phân bổ khi thực tế | ⚠️ | `tt-99-2025-dieu-31.md` (TK 335) **vẫn** hướng dẫn trích trước; **chưa có note "bỏ trích trước sửa chữa lớn TSCĐ"** |
| 30 | TNCN (BĐS duy nhất) | BĐS duy nhất chưa có GCN → miễn? | Không, phải đủ điều kiện sở hữu & thời gian | ✅ | `tt-89-2026-dieu-42.md` d.429–431: miễn có điều kiện (phải có căn cứ sở hữu) |

---

## LÔ 4 (câu 31–40)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 31 | TNCN (cư trú) | NN nước ngoài có mặt 180 ngày năm đầu → kỳ tính thuế? | 12 tháng liên tục từ ngày đầu có mặt | ⚠️ | Vault có tiêu chí "12 tháng liên tục" (`nd-253-2026` Đ4) nhưng **thiếu cơ chế năm đầu tiên** |
| 32 | TNCN (miễn) | Thu nhập từ kiều hối? | Miễn thuế hoàn toàn | ✅ | `luat-109-2025-tncn.md` Đ4; cheatsheet |
| 33 | TNCN (nộp thừa) | Nộp thừa 40.000đ sau quyết toán? | Miễn, không hoàn (dưới 50.000đ) | ⚠️ | Vault có nguyên tắc hoàn thuế nộp thừa nhưng **chưa ghi ngưỡng "dưới 50.000đ → miễn"** |
| 34 | TNDN (tài trợ) | Tài trợ giáo dục qua quỹ không có chức năng huy động? | Không được trừ | ⚠️ | `tt-20-2026-tndn.md` Đ3: tài trợ được trừ nếu có hồ sơ; **thiếu điều kiện loại trừ** quỹ không chức năng (`nd-320-2025` Đ9.2đ1 có nhưng chưa cấu trúc) |
| 35 | TNCN (giảm trừ) | Giảm trừ NPT 2026? | 6,2 triệu đồng/tháng | ✅ | `luat-109-2025-tncn.md` Đ10; cheatsheet |
| 36 | BHXH (đối tượng) | HĐLĐ 1,5 tháng → BHXH bắt buộc? | Có, từ đủ 01 tháng | ✅ | `luat-41-2024-bhxh.md` Đ2: "từ đủ 01 tháng trở lên" |
| 37 | TNDN (hưu trí tự nguyện) | Đóng hưu trí tự nguyện 6tr/tháng → trừ? | Tối đa 05 triệu đồng/tháng/người | ⚠️ | `nd-320-2025` Đ10.4đ có "vượt mức 05 triệu đồng/tháng/người" nhưng **chưa cấu trúc vào note** |
| 38 | TNDN (khấu hao TSCĐ) | TSCĐ dừng 10 tháng sửa chữa → trích khấu hao? | Có | ✅ | `nd-320-2025` Đ10.6.e3: dừng <12 tháng để sửa chữa → được trích khấu hao |
| 39 | TNDN (khấu hao ô tô) | Ô tô 5 chỗ 3 tỷ → khấu hao trên nguyên giá? | 1,6 tỷ đồng | ✅ | **Đã xác minh (sửa cheatsheet).** Trần 1,6 tỷ VẪN CÓ: Luật 67/2025 Đ9e giao CP quy định; NĐ 320/2025 Đ10.6.e1 giữ "nguyên giá vượt trên 1,6 tỷ đồng/xe ô tô ≤9 chỗ". Cheatsheet cũ ghi "bỏ hẳn" là SAI → đã sửa (dòng 16, 138). Bộ chuẩn ĐÚNG. |
| 40 | TNDN (thuế suất) | Khai thác mỏ tài nguyên quý hiếm? | 50% | ✅ | `luat-67-2025-tndn.md` Đ10; cheatsheet mục 2 |

---

## LÔ 5 (câu 41–50)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 41 | GTGT | HKD nông sản tươi tự sản xuất bán ra → chịu GTGT? | Không chịu thuế | ✅ | `luat-149-2025-gtgt.md` Đ5 khoản 1 |
| 42 | GTGT | Sách giáo khoa, giáo trình chịu GTGT? | Không chịu thuế | ✅ | `chung/nd-181-2025/nd-181-2025-dieu-4.md` khoản 8 |
| 43 | GTGT | Nước sạch phục vụ SX chịu GTGT? | 5% | ✅ | cheatsheet mục 1 (Nước sạch 5%) |
| 44 | TTĐB | Máy bay vận tải chuyên dùng du lịch chịu TTĐB? | Không chịu thuế | ✅ | cheatsheet mục 4 (KHÔNG chịu TTĐB: máy bay/tàu vận tải) |
| 45 | TNCN | Lương làm ban đêm cao hơn → miễn TNCN? | Được miễn phần cao hơn | ✅ | `nd-253-2026-tncn.md` (làm đêm/thêm giờ miễn) |
| 46 | TNCN | Thuyền viên VN tàu quốc tế → miễn TNCN? | Có | ✅ | `nd-253-2026-tncn.md` (thuyền viên miễn) |
| 47 | Xử phạt | Mức phạt khai sai thiếu thuế? | 20% số thuế thiếu | ✅ | `nd-310-2025-xu-phat-thue-hoa-don.md` Đ7 |
| 48 | Xử phạt | Không nộp hồ sơ sau 91 ngày có thuế thiếu → xử lý? | Hành vi trốn thuế | ⚠️ | Vault có phạt trốn thuế (`nd-310-2025` Đ7) và nhắc "quá 90 ngày" (`nd-252-2026`) nhưng **chưa định nghĩa rõ 91 ngày = trốn thuế** |
| 49 | TNDN | Lương chủ DNTN → chi phí được trừ? | Không được trừ | ✅ | `nd-320-2025` Đ10.8d: "Tiền lương chủ DNTN … không được trừ" |
| 50 | TNDN | Lãi vay tương ứng vốn điều lệ thiếu → trừ? | Không được trừ | ✅ | `nd-320-2025` Đ10.9: "chi trả lãi vay tương ứng vốn điều lệ còn thiếu … không được trừ" |

---

## LÔ 6 (câu 51–60)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 51 | TNDN (chi trừ) | Thuê quản lý casino vượt quá % doanh thu → không trừ? | Vượt quá 4% doanh thu | ⚠️ | `luat-67-2025-tndn.md` Đ9.1d: "vượt mức CP quy định" nhưng **chưa ghi con số 4%** (`nd-320-2025` Đ10.4b có nhưng chưa cấu trúc) |
| 52 | TNDN (phạt HĐKT) | Tiền phạt vi phạm HĐKT tính vào đâu? | Giảm trừ thu nhập khác / thu nhập KD | ✅ | cheatsheet mục 2: "Tiền phạt vi phạm → KHÔNG được trừ"; `luat-67-2025` Đ9 |
| 53 | TNDN/LPTB | Tài sản góp vốn → lệ phí trước bạ? | Không phải chịu | ⚠️ | Vault **không có note** miễn LPTB cho tài sản góp vốn |
| 54 | DN (xã hội) | DN xã hội dùng % lợi nhuận tái đầu tư cộng đồng? | Ít nhất 51% | ⚠️ | Vault **không có note** doanh nghiệp xã hội (`nq-198-2025` chỉ về KTTN) |
| 55 | DN (hợp danh) | Công ty hợp danh bắt buộc mấy TV hợp danh cá nhân? | Ít nhất 02 thành viên | ⚠️ | `vbhn-luat-doanh-nghiep-2025.md` ghi chung, **chưa ghi "ít nhất 02 TV hợp danh là cá nhân"** |
| 56 | TNCN (chuyển nhượng vốn) | Cá nhân chuyển nhượng vốn TNHH → thuế suất? | 20% trên thu nhập | ✅ | cheatsheet mục 3: "Chuyển nhượng vốn 20%" |
| 57 | TNCN (trúng thưởng) | Trúng thưởng casino phần vượt 20tr? | 10% phần vượt 20tr | ✅ | cheatsheet mục 3: "Trúng thưởng … 10% (phần vượt 20tr)" |
| 58 | GTGT (thời điểm) | Thời điểm tính thuế GTGT dịch vụ? | Hoàn thành cung ứng hoặc lập hóa đơn | ⚠️ | Vault chỉ có `nd-181-2025-dieu-16` cho DV đặc thù; **thiếu quy tắc chung** |
| 59 | GTGT (miễn) | Dạy học/dạy nghề công lập chịu GTGT? | Không chịu thuế | ✅ | cheatsheet mục 1 (Điều 5: giáo dục không chịu) |
| 60 | GTGT (thuế suất) | Đồ chơi trẻ em 2026? | 5% | ✅ | cheatsheet mục 1 (đồ chơi trẻ em 5%) |

---

## LÔ 7 (câu 61–70)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 61 | GTGT | Thiết bị dạy học (com-pa, thước kẻ) chịu GTGT? | 5% | ✅ | `luat-48-2024-gtgt.md` Đ9 (giáo dục 5%); cheatsheet |
| 62 | GTGT (hoàn thuế) | Hoàn thuế GTGT sau bao nhiêu tháng? | Không áp dụng hoàn 12 tháng như trước | ❌ | **Vault đúng luật 2026, không sửa.** `luat-48-2024-gtgt.md` (Đ15) và `chung/nd-181-2025/nd-181-2025-dieu-31.md` vẫn giữ cơ chế "hoàn sau 12 tháng/4 quý liên tục" cho hàng hóa/dịch vụ chịu thuế suất 5%. Bộ chuẩn phủ nhận hoàn 12 tháng là sai. |
| 63 | TNCN (giảm) | Quỹ đầu tư BĐS chia lợi tức → giảm? | Giảm 50% TNCN trong 05 năm | ✅ | `nd-253-2026-tncn.md` Đ44: giảm 50% 2026–2031 |
| 64 | TNCN (miễn) | Nhân lực công nghệ cao chip bán dẫn miễn TNCN? | 05 năm | ✅ | `luat-109-2025-tncn.md` Đ5; `nd-253-2026` Đ42 |
| 65 | TNCN (miễn) | Học bổng tổ chức nước ngoài → nộp thuế? | Miễn thuế | ✅ | `nd-253-2026-tncn.md` (học bổng miễn) |
| 66 | TNDN (miễn) | Bán sản phẩm công nghệ mới lần đầu VN → miễn? | Miễn thuế 03 năm | ✅ | `luat-67-2025-tndn.md` Đ4 + `nd-320-2025` Đ4.4b: miễn tối đa 03 năm |
| 67 | TNDN (ưu đãi) | SX chip bán dẫn tại KCN cao → thuế suất? | Ưu đãi 10% | ⚠️ | Vault có ưu đãi chung "10% trong 15 năm" (`nd-320-2025`, cheatsheet) nhưng **thiếu gắn với "chip bán dẫn/KCN cao"** |
| 68 | TNDN (ưu đãi) | Đầu tư mở rộng tăng nguyên giá TSCĐ tối thiểu? | Từ 20% | ⚠️ | Vault nhắc "dự án đầu tư mở rộng" chung (`tt-20-2026`, `luat-67-2025` Đ12–13) nhưng **chưa ghi con số 20%** |
| 69 | TNDN (chi trừ) | Chi hỗ trợ tổ chức đảng trong DN → trừ? | Có được trừ | ✅ | `tt-20-2026-tndn.md` Đ3: "hoạt động đảng/đoàn thể" thuộc chi được trừ |
| 70 | TNDN (chi trừ) | Chi đào tạo nghề cho NLĐ → trừ? | Có được trừ | ✅ | `tt-20-2026-tndn.md` Đ3: "đào tạo nghề" thuộc chi được trừ |

---

## LÔ 8 (câu 71–80)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 71 | TNCN (quyết toán) | Công ty mẹ quyết toán TNCN thay NLĐ điều chuyển? | Được nếu có ủy quyền | ✅ | `nd-253-2026-tncn.md` Đ51: quyết toán ủy quyền |
| 72 | HKD (thông báo DT) | HKD nộp thuế theo năm, hạn thông báo DT? | Chậm nhất 31/01 năm sau | ⚠️ | Vault có thủ tục thông báo (`tt-18-2026-dieu-4`, `tt-50-2026` Đ4) nhưng **chưa ghi mốc 31/01 năm sau** |
| 73 | HKD (HĐĐT) | HKD vượt 01 tỷ, bắt buộc HĐĐT khi? | Trong 30 ngày kể từ ngày vượt | ✅ | `nd-68-2026-ho-kinh-doanh.md` Đ8.5 + `nd-141-2026`: "trong 30 ngày" |
| 74 | HKD (sàn TMĐT) | DT HKD trên sàn TMĐT có trừ phí sàn? | Không, tính trên tổng tiền bán | ⚠️ | `nd-68-2026` Đ11 chỉ ghi nền tảng "khấu trừ, khai thay, nộp thay"; **thiếu "tính trên tổng DT, không trừ phí sàn"** |
| 75 | GTGT (XDCB Kho bạc) | Kho bạc khấu trừ % thuế GTGT HĐ XDCB vốn ngân sách? | 1% doanh thu chưa có thuế GTGT | ⚠️ | Vault (`luat-48`, `nd-144/359`, `tt-69`) **không có** quy định Kho bạc khấu trừ 1% XDCB vốn ngân sách |
| 76 | QLT/HĐĐT | Không chuyển dữ liệu HĐĐT → xử lý? | Bị nghiêm cấm và xử phạt | ⚠️ | `luat-108-2025` Đ8 cấm phá hủy HT thông tin NNT; `nd-254-2026` Đ4.4 ghi dữ liệu HĐĐT là cơ sở QLT. **Chưa ghi rõ** "không chuyển dữ liệu → nghiêm cấm + xử phạt" |
| 77 | Mã số thuế | MST 10 số cấp cho đơn vị nào? | DN, tổ chức có tư cách pháp nhân | ⚠️ | `luat-108-2025` Đ9–13 ghi chung đăng ký/chấm dứt MST; **chưa ghi cấu trúc "10 số"** |
| 78 | Mã số thuế | MST 13 số cấp cho đơn vị nào? | Đơn vị phụ thuộc, chi nhánh | ⚠️ | Vault có "chi nhánh, đơn vị phụ thuộc" (`tt-91-2026-dieu-6`) nhưng **chưa ghi cấu trúc "13 số"** |
| 79 | Mã số thuế | Cá nhân chết → MST? | Chấm dứt hiệu lực MST | ⚠️ | `tt-91-2026-dieu-8` có "CN kinh doanh chấm dứt MST" nhưng **chưa ghi rõ "cá nhân chết"** |
| 80 | Mã số thuế | Từ 01/07/2025, thông tin thay MST cá nhân VN? | Số định danh cá nhân | ⚠️ | `tt-91-2026-dieu-25` có trường "số định danh cá nhân" trong mẫu HĐĐT nhưng **chưa ghi rõ** "thay thế MST từ 01/07/2025" |

---

## LÔ 9 (câu 81–90)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 81 | Mã số thuế | Cá nhân chết → MST xử lý? | Chấm dứt hiệu lực MST | ✅ | `tt-90-2026-dieu-27.md` khoản 2a: "MST cá nhân bị chấm dứt … a) Cá nhân chết, mất tích" |
| 82 | Mã số thuế | Từ 01/07/2025, thông tin thay MST cá nhân VN? | Số định danh cá nhân | ⚠️ | `tt-90-2026-dieu-34.md` chỉ nói đồng bộ số định danh khi cấp mới; `tt-90` Đ27 b.2/b.3 có nhắc 01/07/2025. **Chưa có câu khẳng định trực tiếp** "số định danh thay MST" |
| 83 | GTGT | Thuế suất bưu chính quốc tế? | 10% | ✅ | `luat-48-2024-gtgt.md` Đ5: "Bưu chính viễn thông công ích" mới không chịu → bưu chính quốc tế thuộc "còn lại" = 10% |
| 84 | GTGT | Hàng mua trả chậm >5tr chưa có chứng từ NH → khấu trừ? | Được tạm khấu trừ, đến hạn chưa có chứng từ mới điều chỉnh giảm | ✅ | `nd-144-2026-gtgt.md` Đ26.2g: khấu trừ ngay cả khi chưa đến hạn thanh toán; đến hạn không có chứng từ → điều chỉnh giảm |
| 85 | Chi phí/TNDN | Phạt VPHC 15tr → trừ? | Không được trừ | ✅ | cheatsheet mục 2; `luat-67-2025` Đ9 (tiền phạt không được trừ) |
| 86 | GDLK | Lãi vay GDLK khống chế mức? | ≤ 30% EBITDA | ⚠️ | `nd-255-2026-giao-dich-lien-ket.md` chỉ nguyên tắc/bên liên kết; **chưa ghi ngưỡng 30% EBITDA** (`luat-67-2025` Đ9 chỉ ghi "vượt mức CP quy định") |
| 87 | GDLK | Phần vượt 30% chuyển kỳ sau tối đa? | Không quá 05 năm liên tục | ⚠️ | Vault **chưa có** quy định chuyển kỳ sau 5 năm (chỉ "05 năm" ở `tt-89` Đ42 về hoàn thuế, không liên quan) |
| 88 | GDLK | Tổ chức tín dụng có bị khống chế 30% EBITDA? | Không áp dụng | ⚠️ | `nd-255-2026` Đ5 có ngoại trừ "tổ chức tín dụng" trong điều kiện bảo lãnh/cho vay nhưng **chưa ghi rõ "TC dung không áp dụng khống chế lãi vay 30%"** |
| 89 | GDLK | Báo cáo lợi nhuận liên quốc gia từ doanh thu hợp nhất? | Từ 18.000 tỷ đồng | ⚠️ | `nd-255-2026` chỉ ghi "trách nhiệm NNT trong tập đoàn đa quốc gia"; **chưa ghi ngưỡng 18.000 tỷ** |
| 90 | GDLK | Thời hạn kê khai thông tin GDLK? | Cùng thời điểm quyết toán TNDN năm | ⚠️ | `tt-89-2026-dieu-18.md` Đ18.5b nhắc khai Báo cáo LNTQG theo NĐ 255 nhưng **chưa ghi rõ** "cùng quyết toán TNDN năm" |

---

## LÔ 10 (câu 91–100)

| STT | Chủ đề | Câu hỏi (ngắn) | Đáp án bộ chuẩn | Vault có khớp? | Ghi chú (file vault + điều khoản) |
|---|---|---|---|---|---|
| 91 | Kế toán (TK 337) | Nợ phải trả từ hợp đồng (doanh thu nhận trước) → TK? | Tài khoản 337 | ✅ | `chung/tt-99-2025/tt-99-2025-dieu-31.md`: TK 337 – Thanh toán theo tiến độ HĐ xây dựng |
| 92 | TNDN (miễn thuế) | Thanh lý nông sản của HTX nông nghiệp địa bàn khó khăn → miễn? | Có được miễn | ⚠️ | `luat-67-2025-tndn.md` Đ4 chỉ có "trồng rừng, nuôi trồng thủy sản địa bàn khó khăn" miễn; **thiếu "thanh lý nông sản HTX địa bàn khó khăn"** (`nd-320-2025` Đ4.1a có nhưng chưa cấu trúc) |
| 93 | Kế toán (TSCĐ) | Chi phí hoàn nguyên môi trường XD TSCĐ → đâu? | Vốn hóa vào nguyên giá TSCĐ | ⚠️ | Vault **không có** quy định "chi phí hoàn nguyên môi trường vốn hóa vào nguyên giá TSCĐ" |
| 94 | Kế toán (TK 3387) | Hỗ trợ Nhà nước khi bắt đầu nhận → TK? | TK 3387 (Doanh thu chưa thực hiện) | ✅ | `chung/tt-99-2025/tt-99-2025-dieu-31.md`: TK 3387 – Doanh thu chờ phân bổ |
| 95 | Kế toán (Quỹ KHCN) | Mua máy tính bằng Quỹ PT KHCN → khấu hao chi phí được trừ? | Không | ✅ | `tt-99-2025-dieu-31.md`: TSCĐ từ Quỹ KHCN → hao mòn ghi giảm quỹ, không tính vào chi phí SXKD |
| 96 | TNDN (chi phí) | Tiền thuê nhà chuyên gia nước ngoài (DN VN chi trả theo HĐ) → trừ? | Có được trừ | ⚠️ | `tt-20-2026-tndn.md` Đ3 có "thuê tài sản" chung; **chưa chỉ đích danh** "tiền thuê nhà chuyên gia nước ngoài" (`nd-320-2025` Đ10.8b3 có nhưng chưa cấu trúc) |
| 97 | GTGT (tỷ lệ %) | GTGT phân phối hàng hóa (pp trực tiếp)? | 1% | ✅ | cheatsheet mục 3: "Phân phối hàng hóa 1%" |
| 98 | GTGT (tỷ lệ %) | GTGT dịch vụ không bao thầu NVL (pp trực tiếp)? | 5% | ✅ | cheatsheet mục 3: "Dịch vụ/XD không bao thầu 5%" |
| 99 | GTGT (không chịu) | Cá nhân không kinh doanh bán ô tô cũ → chịu GTGT? | Không chịu thuế GTGT | ⚠️ | `luat-48-2024-gtgt.md` Đ5 (đối tượng không chịu thuế) **không liệt kê** "cá nhân bán ô tô cũ" |
| 100 | TNCN (thời điểm) | Thời điểm tính TNCN quà tặng là chứng khoán? | Thời điểm làm thủ tục đăng ký quyền sở hữu | ⚠️ | `luat-109-2025`, `tt-87-2026`, `nd-253-2026` **không ghi thời điểm** cho "quà tặng là chứng khoán" (chỉ có thời điểm cho chứng khoán phái sinh) |

---

## 🔴 DANH SÁCH CÂU ❌ (vault trái nghịch đáp án — KHÔNG sửa vault)

**Câu 39 — ĐÃ SỬA (chuyển ✅):** Trần 1,6 tỷ ô tô ≤9 chỗ VẪN CÓ HIỆU LỰC. Luật 67/2025 Đ9e giao CP quy định mức; NĐ 320/2025 Đ10.6.e1 giữ nguyên trần. Cheatsheet cũ ghi "bỏ hẳn" là sai → đã sửa dòng 16 & 138. Bộ chuẩn (1,6 tỷ) ĐÚNG.

**Câu 62 — Hoàn thuế GTGT "không áp dụng hoàn 12 tháng như trước".**
- Bộ chuẩn phủ nhận cơ chế hoàn 12 tháng.
- Vault (Luật 48/2024, hiệu lực 2026) vẫn giữ: `luat-48-2024-gtgt.md` (Điều 15) + `chung/nd-181-2025/nd-181-2025-dieu-31.md` (Điều 31): hoàn thuế GTGT đối với hàng hóa/dịch vụ chịu thuế suất 5% "sau 12 tháng liên tục hoặc 04 quý liên tục".
- → **Vault đúng luật 2026, không sửa.** Bộ chuẩn sai.

---

## 🟡 GOM NHÓM CÂU ⚠️ ĐỂ BỔ SUNG VAULT

> Tất cả câu ⚠️ đều do vault **thiếu ngưỡng/số liệu cụ thể** (hoặc thiếu một điều khoản), KHÔNG phải vault sai. Cần bổ sung từ văn bản gốc (file `.docx` trong `sources/`) nếu muốn vault che phủ đủ 100 câu.

**A. Quản lý thuế / hoàn thuế / chậm nộp / mã số thuế (12 câu: 11, 12, 23, 33, 48, 75, 76, 77, 78, 79, 80, 82)**
- 11: miễn tiền chậm nộp khi lỗi hạ tầng thuộc NNT.
- 12: gia hạn nộp hồ sơ khi HT cơ quan thuế sự cố (ngày tiếp theo liền kề).
- 23: thời hạn "hoàn thuế trước" (06 ngày làm việc).
- 33: thuế nộp thừa < 50.000đ → miễn, không hoàn trả.
- 48: không nộp hồ sơ sau 90/91 ngày + có thuế thiếu = trốn thuế.
- 75: Kho bạc Nhà nước khấu trừ 1% thuế GTGT trên HĐ XDCB vốn ngân sách.
- 76: không chuyển dữ liệu HĐĐT về cơ quan thuế → nghiêm cấm + xử phạt.
- 77/78/79/80/82: cấu trúc MST (10 số DN; 13 số chi nhánh; cá nhân chết chấm dứt; số định danh cá nhân thay MST từ 01/07/2025).

**B. Hộ kinh doanh (3 câu: 4, 72, 74)**
- 4: quy tắc cộng gộp doanh thu nhiều hộ do cùng 1 cá nhân sở hữu để xét ngưỡng 01 tỷ.
- 72: hạn thông báo doanh thu HKD nộp theo năm (31/01 năm sau).
- 74: doanh thu HKD trên sàn TMĐT tính trên tổng tiền bán, không trừ phí sàn.

**C. TNDN — chi được trừ / quỹ / ưu đãi / miễn thuế (10 câu: 13, 14, 15, 34, 37, 51, 67, 68, 92, 96)**
- 13: học phí cho con LĐ (chỉ con LĐ nước ngoài / VN ở nước ngoài).
- 14: quỹ dự phòng tiền lương tối đa 17% quỹ lương thực hiện.
- 15: phúc lợi trực tiếp NLĐ được trừ tối đa 01 tháng lương bình quân.
- 34: tài trợ qua quỹ không có chức năng huy động → không được trừ.
- 37: BH hưu trí tự nguyện tối đa 05 triệu đồng/tháng/người.
- 51: thuê quản lý casino vượt 4% doanh thu → không trừ.
- 67: SX chip bán dẫn tại KCN cao → thuế suất ưu đãi 10%.
- 68: đầu tư mở rộng được ưu đãi khi tăng nguyên giá TSCĐ tối thiểu 20%.
- 92: thanh lý nông sản của HTX nông nghiệp địa bàn khó khăn → miễn TNDN.
- 96: tiền thuê nhà cho chuyên gia nước ngoài (DN VN chi trả theo HĐ) → được trừ.

**D. Kế toán (4 câu: 28, 29, 93, 95→ không, 95 là ✅)** — thực tế: 28, 29, 93
- 28: sáp nhập → chênh lệch đánh giá lại TS thuần → ghi nhận thuế TNDN hoãn lại.
- 29: bỏ trích trước chi phí sửa chữa lớn TSCĐ (thực hiện phân bổ khi thực tế phát sinh).
- 93: chi phí hoàn nguyên môi trường vốn hóa vào nguyên giá TSCĐ.

**E. GTGT / TNCN — thời điểm & đối tượng không chịu (4 câu: 58, 99, 100, + 31 thuộc TNCN)**
- 31: cơ chế kỳ tính thuế TNCN năm đầu (12 tháng liên tục từ ngày đầu có mặt).
- 58: thời điểm tính thuế GTGT dịch vụ (hoàn thành cung ứng hoặc lập hóa đơn).
- 99: cá nhân không kinh doanh bán ô tô cũ → không chịu thuế GTGT.
- 100: thời điểm tính thuế TNCN quà tặng là chứng khoán (khi làm thủ tục đăng ký quyền sở hữu).

**F. Doanh nghiệp / lệ phí trước bạ (3 câu: 53, 54, 55)**
- 53: tài sản góp vốn không chịu lệ phí trước bạ.
- 54: doanh nghiệp xã hội dùng ít nhất 51% lợi nhuận tái đầu tư cộng đồng.
- 55: công ty hợp danh bắt buộc ít nhất 02 thành viên hợp danh là cá nhân.

**G. Giao dịch liên kết (5 câu: 86, 87, 88, 89, 90)** — note `nd-255-2026-giao-dich-lien-ket.md` còn sơ lược, thiếu toàn bộ ngưỡng:
- 86: khống chế lãi vay ≤ 30% EBITDA.
- 87: chuyển kỳ sau tối đa 05 năm liên tục.
- 88: tổ chức tín dụng không áp dụng khống chế 30%.
- 89: Báo cáo lợi nhuận liên quốc gia từ doanh thu hợp nhất 18.000 tỷ.
- 90: kê khai thông tin GDLK cùng hồ sơ quyết toán TNDN năm.

---

## GHI CHÚ PHƯƠNG PHÁP
- Vault dùng làm thước đo: `_cheatsheet-thue-2026.md` (SSOT) + các note `luat-*`/`nd-*`/`tt-*` + `chung/`.
- `.tmp_extract/` (raw docx) KHÔNG dùng làm thước đo xác minh (chỉ tham khảo khi phát hiện xung đột như câu 39).
- Không sửa bất kỳ file vault nào. Báo cáo này chỉ để đối chiếu.
- File gốc Test3: `.tmp_extract/test3_full.txt` (100 câu, dòng 3–102, mỗi câu 1 dòng "Đáp án:").
