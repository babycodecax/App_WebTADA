# CHUẨN BÀI BLOG TADA — chốt 20/10/2026 (mọi bài từ nay, không ngoại lệ)

Kiểm tra tự động trước khi publish: `python tools/check-post-format.py <file-draft.md>`

## 1. Thông số cố định
- Title: 50–60 ký tự, keyword chính nằm trong 3 từ đầu, có dấu ? hoặc con số khi tự nhiên.
- Summary: 150–160 ký tự, nêu lợi ích + mốc thời gian/pháp lý.
- Dung lượng: checker chặn **1100–1800 từ**; mục tiêu VIẾT ≤1750 theo ngân sách từng mục (mục 1b). H2 = câu hỏi tự nhiên. FAQ 3–5 câu (`## Câu hỏi thường gặp`), câu hỏi in đậm đúng `**Câu n: ...?**`, câu trả lời 2–4 câu.
- Tối thiểu 1 bảng so sánh (ddl/tình huống) hoặc checklist.
- Nguồn: vault là nền tảng; nghiễm pháp lý DUY NHẤT cần số hiệu + điều/khoản cụ thể; 2 nguồn độc lập khi dùng web; nguồn mâu thuẫn gi 2 hướng đọc + ghi "chưa chốt".

## 1b. Ngân sách từ + checklist cứng (chặn trước khi gọi checker lần đầu)

Ngân sách viết (checker không tính khối `<figure>` vào word count):

| Mục | Cap |
|---|---|
| Mở bài (trước H2 đầu) | ≤130 từ |
| Mỗi H2 nội dung (kể bảng) | ≤300 từ |
| H2 FAQ toàn khối | ≤320 từ |
| CTA xưng "em" | ≤60 từ |
| Tổng thân bài | ≤1750 (buffer 50 cho mốc 1800) |

Viết xong H2 nào thì tự đếm mục đó ngay (cắt theo `## `, đếm từ) — KHÔNG viết dài rồi cắt 7 vòng như phiên NĐ 398 (2331→1800 costing 7 vòng checker).

Checklist 5 gãy cố định — kiểm trước khi check format:
1. FAQ: đúng `**Câu n: ...?**` in đậm (checker bắt prefix `Câu n`), n∈3–5.
2. Byline Nguồn = loại xuất bản + ngày (VD "Công báo ngày 29/10/2026") + câu "Văn bản pháp lý xem mục Căn cứ pháp lý phía trên." — CẤM liệt tên văn bản trong dòng Nguồn (checker flag).
3. Title 50–60 ký tự, keyword đúng 3 từ đầu.
4. `## Xem thêm`: 5–6 slug LẤY TỪ DB qua REST (título thật) trước khi viết — CẤM build link theo trí nhớ.
5. H2 đều dạng câu hỏi + ≥1 bảng + figure `<figure class="blog-figure">` khi nhắc mẫu (ảnh tạo trước deploy).

## 2. Khung content cuối bài (bắt buộc, đúng thứ tự)
```
...(phần CTA 1–2 câu xưng "em")

## Xem thêm

- [Bài liên quan 1](https://ketoanthuetada.com/blog/<slug>)
- [Bài liên quan 2](...)  — tổng 5 mục, chọn slug VERIFIED published trong DB, ưu tiên cùng chủ đề

---

> **Căn cứ pháp lý:** [Tên văn bản](google-search-link); [văn bản 2](...); ... (seo link google.com/search?q=toàn+văn+...)

---
*Bài viết được thực hiện bởi Đội ngũ Chuyên gia Thuế TADA.*
*Cập nhật: MM/2026 | Nguồn thời sự: <tên nguồn + ngày>. Văn bản pháp lý xem mục Căn cứ pháp lý phía trên.*
```
- CẤM byline kiểu "Dịch Vụ Thuế Kế Toán TADA. Cập nhật...". CẤM dòng italic "Xem thêm: a | b | c" (đã bị bỏ — Xem thêm là SECTION H2).
- Với byline + căn cứ pháp lý → tái hiện .blog-detail .content a... không gì thêm.

## 3. Link nội bộ
- ≥ 2 trong thân bài + `## Xem thêm`= 5 mục trong DB (verified bằng REST trước khi patch). Slug tuyệt đối `https://ketoanthuetada.com/blog/<slug>`.

## 3b. Ảnh biểu mẫu (bắt buộc khi bài nói về biểu mẫu/tờ khai)
- Bài nhắc mẫu tờ khai (01/TKN-CNKD, 01/CNKD, 02/QTT...) → chèn ảnh biểu mẫu vào thân bài bằng `<figure class="blog-figure">` với `src="/static/img/blog/<ten>.png"` + `figcaption` (nội dung khoanh + nguồn văn bản).
- Ảnh có sẵn trong `img/blog/` dùng ngay; chưa có thì tạo bằng `tools/form-image.py` (`--pdf` tìm trang theo cụm từ, render 2x, khoanh đỏ theo tọa độ; fallback `--img`) — và FB dùng luôn ảnh biểu mẫu đó (không Pexels).
- Sau publish: live verify ảnh HTTP 200 + `blog-figure` xuất hiện trong HTML (dùng `?cb=` nếu CDN cache 60s).

## 4. Publish (tự động sau khi user duyệt content)
1. Chạy 1 lệnh pipeline chính thức (KHÔNG INSERT tay bằng curl/upload-single.js — script đó đọc backend/.env với key legacy đã khóa 19/10/2026):
   - Xem trước: `python tools/publish-post.py --draft <file.md> --dry-run`
   - Thực chạy: `python tools/publish-post.py --draft <file.md> --backfill` — tự làm: preflight → INSERT blog_posts (published_at ISO UTC) → verify REST → KB backfill → IndexNow → Bing → audit `tools/publish-log.jsonl`.
   - Env đúng: key nằm `api/.env` (SUPABASE_SERVICE_ROLE_KEY); backend/.env chỉ còn ANON (chỉ GET được bài published).
   - Console nổ charmap khi backfill → chạy lại với `PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8`.
2. Gate duyệt: review_status="approved" trong frontmatter (user duyệt → đổi từ "pending").
3. Verify bổ sung: `python tools/verify-live.py` + curl live `?nocache=`: H1, bảng, Xem thêm H2 5 link, blockquote, byline, ảnh figure 200.
4. Song song FB: post 500–700 từ (viết theo quick-facts, KHÔNG copy mở đầu của blog; ≤2 "→", hashtags 3–5, câu chốt "?" không trùng 2 bài trước; sau khi viết proofread 1 pass bằng Read để nhặt lỗi gõ sót) + comment mẫu sau `---COMMENT---`; ảnh dùng luôn figure bài (không Pexels).
5. Append progress.md (append xong re-read kiểm tra ký tự lỗi).
6. Chỉ 1 bước của user: đăng FB thủ công.

## 4b. Commit + deploy 1 nhịp (asset TRƯỚC deploy)
- CHỈ deploy khi user có lệnh. Trước khi xin deploy phải đủ: checker PASS + figure PNG đã tạo đủ 3 nhánh (img/blog + api/public/img/blog + backend/static/img/blog) + FB xong + vault xong → 1 đợt commit (vault/content tách 2 commit) → `python tools/predeploy-check.py` PASS → push → `npx vercel deploy --prod --yes` từ api/ (LƯU Ý: `vercel --prod` không deploy, phải `vercel deploy --prod`) → `python tools/verify-live.py` + curl từng figure HTTP 200 + trang bài 200.
- Bài học NĐ 398 (31/10): deploy sáng chạy TRƯỚC khi hình xong → chiều phải deploy lần 2 để chữa ảnh live 404. Figure và mọi asset inline phải cùng nhịp deploy.

## 5. Vấn đề kỹ thuật đã chốt
- Write dài dễ sinh token rác → luôn scan + sửa bằng script thay vì tái vặt toàn file.
- IndexNow: file JSON qua `--data-binary @file`.
- DB là nguồn sự thật; file draft giữ `published_at: null` ở frontmatter.
