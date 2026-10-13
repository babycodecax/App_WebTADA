# Handoff — Rebuild trang tính thuế TADA (giữ logic, thay giao diện)

Ngày: 2026-09-20 | Người nhận: dự án App_WebTADA | Trạng thái: đã rà soát xong, demo HKD chạy, chờ 4 quyết định.

## 1. Mục tiêu (user chốt)

- Rebuild TOÀN BỘ trang `/tinh-thue`, **chỉ thay giao diện, giữ nguyên logic tính**.
- Engine đúng chuẩn: **dưới 1 tỷ = Nhóm 1 miễn** (user xác nhận; vault đã sửa khớp theo).

## 2. Phân nhóm HKD chuẩn (đã xác nhận)

| Nhóm | Doanh thu | Kê khai |
|---|---|---|
| N1 | ≤ 1 tỷ | Miễn GTGT+TNCN, chỉ thông báo DT (31/01 năm sau) |
| N2 | 1 – dưới 3 tỷ | Tỷ lệ %, theo quý |
| N3 | 3 – dưới 50 tỷ | Tỷ lệ %, theo quý (NĐ 68 Đ10: ≤50 tỷ khai quý — sửa 03/10/2026, trước đó ghi nhầm theo tháng) |
| N4 | ≥ 50 tỷ | Theo tháng + hạch toán đầy đủ |

- TNCN HKD = (DT − 1 tỷ) × tỷ lệ (HKD_THRESHOLD trong `js/tax-rates.js:112`).
- Case kiểm tay: 2 tỷ phân phối → GTGT 100tr + TNCN 20tr = 120tr... (xem §5).

## 3. Checklist đủ chức năng (nguồn: code-explorer + spot-check)

### 3.1. Salary — lương + vãng lai gộp
- Radio HĐ ≥3/<3 tháng (toggle 2 khối permanent/temporary). Lương tháng, BHXH mặc định bật (trần 29,8tr), công đoàn 1%, khấu trừ NSDLĐ, thu nhập vãng lai + 10% đã giữ, box cam kết chưa khấu trừ.
- GTGC + NPT dùng chung (stepper 0–20). Gộp mọi nguồn lương: GTGC/BHXH/NPT tính 1 lần, lũy tiến trên tổng.
- File: `tax-ui.js:236-302,646-654,718-817` · rates `tax-rates.js:18-52`.

### 3.2. HKD — 4 nhóm, 2 cách tính
- Doanh thu năm, select 6 lĩnh vực (`tax-forms-data.js:12-19`), chi phí vốn, badge nhóm live.
- C1: GTGT=DT×tỷ lệ (1/5/3/2/5/3%), TNCN=(DT−1tỷ)×tỷ lệ (0.5/2/1.5/1/5/5%).
- C2: GTGT giữ nguyên + lũy tiến HKD 15/17/20% trên (DT−CP). So sánh, gợi ý, breakdown.
- File: `tax-calculators.js:207-340` · gọi tại `tax-ui.js:876`.

### 3.3. Rental — GỘP VÀO HKD từ 03/10/2026 (thẻ riêng tính sai 10% full DT; luật đúng: GTGT 5%×DT + TNCN 5%×(DT−1tỷ) = nhánh cho_thue_bds của HKD; link cũ tự chuyển).

### 3.4. Investment — UI 6 loại (thiếu 4 so với rates: chuyển nhượng vốn 20%, bản quyền, bảo hiểm, kiều hối).
- Công thức inline `tax-ui.js:879`. → Quyết định §4.2.

### 3.5. Corporate — 12 ngành, 3 nhánh (miễn ≤1 tỷ / % cố định / kê khai).
- Doanh thu, TNTT, từ thiện ≤20%, R&D ≤10%, lỗ ≤5 năm, % tự nhập. UI hiện/ẩn theo ngành (`updateCorpSectorUI`). Cảnh báo tiền mặt ≥5tr.
- File: `tax-calculators.js:346-464` · `tax-ui.js:363-446`.

### 3.6. Foreign/NCNN — 3 diện + tháng/năm đến/đi (chỉ diện lương) + split-year GTGC.
- Box kỳ tính + cảnh báo đỏ <6 tháng + lock nút Tính. File: `tax-calculators.js:516-616` · `tax-ui.js:456-621,782-804`.

### 3.7. Multi-source
- Card thêm instance (badge ×N), xóa + đánh số lại, giữ input khi re-render.
- Hero tổng/năm + tổng/tháng + badge quyết toán 31/07. Hoàn/thiếu chỉ khi có vãng lai (box xanh/đỏ + breakdown + ngoại lệ miễn).
- Nút Tính lại reset. File: `tax-ui.js:17-21,51-228,894-926,1031-1053,1549-1559`.

### 3.8. Tiện ích
- Wizard 2 bước (giữ id `step-1`/`step-3`). Share hash `#!v=1&...` (encode/restore/tự tính; THIẾU charity/R&D/khấu trừ/instance-2).
- Lịch 9 hạn nộp (`tax-forms-data.js:63-77`), chấm đỏ/vàng/xanh + đếm ngày.
- 3 tab (chi tiết/khuyến nghị/lịch), breakdown + thủ tục (mã–hạn–nơi nộp, `FORMS_DATA` 7 mẫu), confetti, tips, disclaimer + FAQ schema.
- VNĐ format khi gõ, responsive 768/480, SEO (canonical `/tinh-thue`, OG, JSON-LD WebApplication/Breadcrumb/FAQ).
- 100% client-side, không gọi backend (chỉ clipboard + scroll). Thứ tự load: rates→calculators→forms-data→ui.

## 4. Bốn quyết định chờ user (user chốt 03/10/2026)

1. GTGT độc lập: THÊM VÀO bản mới.
2. Đầu tư thiếu 4 loại: BỔ SUNG đủ 10 loại.
3. HKD/rental/investment trùng ID khi 2 instance: SỬA LỖI.
4. Share hash thiếu field: BỔ SUNG đủ (từ thiện, R&D, khấu trừ, instance-2).

## 5. Case test vàng (engine đã verify)

- 800tr phân phối → N1, exempt, total 0.
- 2 tỷ phân phối, CP 200tr → N2, C1=25tr (GTGT 20tr + TNCN 5tr), C2=290tr, chọn C1.
- 3 tỷ dịch vụ (`businessType: 'dich_vu_xd'`) → GTGT 150tr + TNCN 40tr = 190tr; C2=600tr (GTGT 150tr + 15%×3tỷ vì DT đúng 3 tỷ thuộc band 15%); chênh 410tr. Sửa 03/10/2026: C2 chọn suất theo DOANH THU (15/17/20%), trước đó engine chọn bậc theo thu nhập (sai khi chi phí lớn).
- Script verify: `C:\Users\ADMIN\AppData\Local\Temp\opencode\verify-tax.mjs` (đã xóa bản copy trong demo; chạy lại khi cần).

## 6. Demo đã dựng (tham khảo UI)

- Vị trí: `D:\Projects\tinh-thue-demo\` (Vite React-TS + Tailwind v4 free).
- Logic: copy nguyên `tax-rates.js` + `tax-calculators.js` (không sửa số), wrapper `src/lib/tax.ts`.
- UI hiện có: form HKD (DT/lĩnh vực/CP, format nghìn khi gõ) → badge nhóm → 3 thẻ (số gọn triệu/tỷ + số exact) → so sánh 2 cách → donut SVG → breakdown lũy tiến → tips → disclaimer.
- Dev: `http://localhost:8905/` (đang chạy nền). Build sạch.

## 7. Vault đã sửa khớp engine (ngày 2026-09-20)

- `vault/thue-ke-toan/huong-dan/so-tay-thue-hkd.md`: bảng nhóm, §3.1–3.4, §4.2, FAQ (ví dụ 2,5 tỷ N2 → 55 tỷ N4).
- `vault/thue-ke-toan/bieu-mau/mau-so-sach-hkd-tt152.md`: bảng trường hợp + §5 ghi sổ theo nhóm.
- Supabase: nạp lại 2 file (22 + 24 chunks `vault/...`).

## 8. Quy tắc deploy khi cắt sóng (từ memory dự án)

- Giữ URL `/tinh-thue`, sitemap, canonical. Chạy song song cũ/mới 1–2 tuần đối chiếu test vàng.
- Sync tay root → `api/public/` (+`backend/static/`), hash-verify, KHÔNG chạy `sync-public.js` nguyên bản.
- Preview local + user duyệt mới commit/push. Review code sau mọi sửa (`code-reviewer`).
- Lưu ý drift: `api/public` từng có code mới hơn root (tax 15/09) — diff trước khi copy.

## 9. Bẫy đã biết (đừng vấp lại)

- `tax-ui.js` 85KB vi phạm quy tắc 800 dòng/file — rebuild chia module/máy tính.
- Copy mù root→api/public từng xóa 237 dòng tính năng (18/09). Luôn diff trước.
- `api/public/static/` là bản copy cũ (ignored) — refresh khi preview.
- Không dùng `\"` trong frontmatter, regex `\n` vs `\r\n` Windows khi parse.
