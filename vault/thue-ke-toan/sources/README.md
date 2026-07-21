# sources/ — Nơi chứa tài liệu gốc (thuế & kế toán)

> Thư mục này chứa các **file gốc** do người dùng cung cấp (PDF, Word, txt…).
> KHÔNG để file tóm tắt AI (Audio Overview, Briefing Doc…) vào đây.

## Quy trình
1. Xuất file gốc từ NotebookLM (tab Sources → ⋮ → Download) hoặc copy file thô từ máy.
2. Bỏ vào thư mục này.
3. Nhắn Claude: "xử lý file trong sources/" → Claude trích xuất thành note chuẩn trong `../`.

## Quy tắc
- Mọi note sinh ra phải ghi `source` trỏ về file gốc trong thư mục này.
- Claude CHỈ trích xuất, KHÔNG tự bịa/thêm kiến thức.
- File gốc giữ nguyên làm bằng chứng kiểm chứng.
