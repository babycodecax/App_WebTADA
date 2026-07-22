# AI Second Brain — Dự án bộ não riêng cho AI

Dự án cá nhân xây dựng một "bộ não thứ hai" (second brain) local, do người dùng sở hữu,
dùng để cấp context lâu dài cho AI agent (Claude Code).

## Mục tiêu
- Có một kho tri thức duy nhất, inspectable (mở ra đọc/sửa bằng mắt được).
- Dữ liệu nằm local, không phụ thuộc vendor cloud.
- AI đọc kho này trước khi trả lời → luôn bám sát thực tế theo từng lĩnh vực.

## Hướng đã chốt (tối ưu cho người không rành kỹ thuật)
- **Local Workspace**: Obsidian vault + `obsidian-skills` (cho Claude Code đọc/viết).
- **Nơi vận hành**: Claude Code / Projects.
- **Nguồn kiến thức**: CHỈ tài liệu người dùng tự thêm vào vault — không từ NotebookLM, không tự suy luận.
- Tổ chức theo khung 5 giai đoạn: Collect → Organize → Evolve → Use → Govern.

## Cấu trúc thư mục
```
ai-second-brain/
├── README.md              # Tổng quan này
├── CLAUDE.md              # Hướng dẫn 5 giai đoạn cho Claude (tiếng Việt)
├── docs/PROJECT_MEMORY.md # Phân tích chi tiết, so sánh giải pháp
├── memory/MEMORY.md       # Chỉ mục memory riêng dự án
└── vault/                 # (Tương lai) Obsidian vault chứa tri thức
```

## Nguồn tham khảo
- `awesome-second-brain` — khung lifecycle + so sánh ~24 giải pháp.
- `obsidian-skills` (kepano) — skills cho Claude Code thao tác Obsidian.
