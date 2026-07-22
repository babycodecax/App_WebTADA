# CLAUDE — Dự án AI Second Brain

Bộ não riêng local cho AI. Người dùng không rành kỹ thuật. Dùng chung cho NHIỀU lĩnh vực (không gắn riêng dự án nào).

## Nguyên tắc
1. Trả lời tiếng Việt, ngắn gọn, trọng tâm.
2. Ưu tiên giải pháp local, inspectable, do người dùng sở hữu. Tránh vendor cloud-only.
3. Không tự động dùng giải pháp Agent Memory / Substrate (thiên dev).

## Quy trình 5 giai đoạn (thực hiện khi làm việc với vault)
Khi người dùng nhờ gom/整理 tri thức, làm theo:
1. **Collect** — thu thập tài liệu, quyết định, lịch sử chat (theo bất kỳ lĩnh vực nào) vào `vault/`.
2. **Organize** — gắn `frontmatter` (title/tags/nguồn), dùng `[[wikilink]]` liên kết, cập nhật index.
3. **Evolve** — khi được yêu cầu: lint link gãy, gộp note trùng, cập nhật thông tin cũ.
4. **Use** — trước khi trả lời, ưu tiên đọc context từ `vault/` rồi mới suy luận.
5. **Govern** — ghi rõ nguồn gốc (provenance) mỗi note để người dùng kiểm tra được.

## Liên kết dự án trong workspace
- `obsidian-chatbot/` — RAG backend đọc vault này để trả lời câu hỏi thuế (BM25 + OpenRouter).
- `App_WebTADA/` — website landing page có tích hợp chatbox gọi RAG backend.

## Công cụ
- `obsidian-skills` (skills/ trong repo obsidian-skills) để đọc/viết Obsidian Markdown/Bases/Canvas.
- defuddle để lọc sạch trang web thành Markdown trước khi lưu.

## Sub-brain (bộ não con theo lĩnh vực)
Dự án này chứa nhiều sub-brain, mỗi lĩnh vực 1 thư mục trong `vault/` và tách biệt bằng tag namespace.

### Thuế & Kế toán → `vault/thue-ke-toan/`
- Tag namespace: `#tax`, `#tax/<chủ-đề>`. Frontmatter bắt buộc: `domain: tax`.
- File chuẩn: `_index.md` (MOC), `_template.md` (mẫu), `glossary.md` (thuật ngữ).
- Quy tắc: mọi note gắn nguồn (`source`); dùng `[[wikilink]]`; copy `_template.md` khi tạo note mới.
- ⚠️ **NGUỒN KIẾN THỨC = TÀI LIỆU NGƯỜI DÙNG TỰ THÊM.** Không tự suy luận, không bịa, không kéo từ NotebookLM hay bất kỳ nguồn ngoài nào. Khi người dùng thêm tài liệu, Claude CHỈ trích xuất / cấu trúc / gắn thẻ vào vault, không tự thêm kiến thức.

## Lưu memory dự án
Cập nhật `docs/PROJECT_MEMORY.md` mỗi phiên có tiến độ/thay đổi quyết định.
