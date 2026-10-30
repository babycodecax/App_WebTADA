# CHUẨN BÀI BLOG TADA — chốt 20/10/2026 (mọi bài từ nay, không ngoại lệ)

Kiểm tra tự động trước khi publish: `python tools/check-post-format.py <file-draft.md>`

## 1. Thông số cố định
- Title: 50–60 ký tự, keyword chính nằm trong 3 từ đầu, có dấu ? hoặc con số khi tự nhiên.
- Summary: 150–160 ký tự, nêu lợi ích + mốc thời gian/pháp lý.
- Dung lượng: 1200–1500 từ. H2 = câu hỏi tự nhiên. FAQ 3–5 câu (`## Câu hỏi thường gặp`), câu hỏi in đậm, câu trả lời 2–4 câu.
- Tối thiểu 1 bảng so sánh (ddl/tình huống) hoặc checklist.
- Nguồn: vault là nền tảng; nghiễm pháp lý DUY NHẤT cần số hiệu + điều/khoản cụ thể; 2 nguồn độc lập khi dùng web; nguồn mâu thuẫn gi 2 hướng đọc + ghi "chưa chốt".

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
1. Scan ký tự lạ (script; 0 FFFD/CJK/garbage) + `check-post-format.py` PASS.
2. INSERT blog_posts: published_at = ISO UTC timestamptz (KHÔNG date-only), status "published".
3. Verify: REST GET row + fetch live `?nocache=`: H1, bảng, Xem thêm H2 5 link, blockquote, byline.
4. Song song FB: post 500–700 từ (không markdown, ≤2 "→", hashtags 3–5, câu chốt "?" không trùng 2 bài trước) + ảnh `make-post-image.py auto <hook> --query "..."` (check ảnh bằng Read; sai mùa thì đổi query) + first comment mẫu sau `---COMMENT---`.
5. IndexNow file JSON (KHÔNG inline curl) + `bing-submit.py --url /blog/<slug>`; GSC để runner mở máy.
6. Append progress.md. Chỉ 1 bước của user: đăng FB thủ công.

## 5. Vấn đề kỹ thuật đã chốt
- Write dài dễ sinh token rác → luôn scan + sửa bằng script thay vì tái vặt toàn file.
- IndexNow: file JSON qua `--data-binary @file`.
- DB là nguồn sự thật; file draft giữ `published_at: null` ở frontmatter.
