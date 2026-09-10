# App_WebTADA — Hệ thống Chatbot Thuế/Kế toán (1 project duy nhất) <!-- hook-test-2026-08-14 -->

## Cấu trúc

```
App_WebTADA/
├── index.html, css/, js/, img/   ← Landing page + Chatbox frontend
├── api/                          ← Next.js proxy → RAG backend
├── backend/                      ← RAG Backend (Python FastAPI)
│   ├── main.py                   ← FastAPI app, routing, CORS
│   ├── db.py                     ← Supabase client
│   ├── ingestion.py              ← Parse + chunk + ingest
│   ├── search_engine.py          ← BM25 + underthesea tokenizer
│   ├── llm_client.py             ← OpenRouter SSE streaming
│   ├── requirements.txt
│   └── .env                      ← Supabase + OpenRouter credentials
├── vault/                        ← Kho tri thức gốc
│   ├── thue-ke-toan/             ← ~281 notes .md thuế/kế toán
│   └── legal/                    ← Văn bản pháp luật
├── tools/                        ← Công cụ xử lý tài liệu
│   ├── extract_docx.py           ← Trích xuất .docx → text
│   ├── split_docx_to_notes.py    ← Tách .docx thành notes .md
│   └── ...
├── claude-code.bat               ← Shortcut chạy Claude Code
└── .gitignore
```

## Rule

1. **Tuyệt đối không đụng vault/** — đây là kho tri thức gốc, chỉ đọc.
2. **Backend = `/backend/`** — chỉ chạy python từ thư mục này.
3. **Không dùng vector DB/embedding** — chỉ BM25 + OpenRouter.
4. **Chỉ gọi LLM qua OpenRouter** — https://openrouter.ai/api/v1/chat/completions.

## Bộ nhớ dự án (Obsidian)

- Vault: `D:/CodeApp/Projects/ai-second-brain/vault/claude-memory/App_WebTADA/`
- Tri thức dùng chung: `D:/CodeApp/Projects/ai-second-brain/vault/claude-memory/_shared/`
- **Quy tắc:** Trước khi code, đọc toàn bộ memory của dự án này trong vault + `_shared/` để nắm quyết định, bài học, pattern đã có.

## 📚 Kiến thức vault dự án

> [!important] BẮT BUỘC nạp vault khi mỗi phiên mới
> Khi bắt đầu phiên mới (hoặc `/resume-session`), PHẢI đọc:
> 1. **Vault App_WebTADA:** `D:/CodeApp/Projects/ai-second-brain/vault/claude-memory/App_WebTADA/` (README, decision-log, lessons, progress)
> 2. **Vault shared:** `D:/CodeApp/Projects/ai-second-brain/vault/claude-memory/_shared/` (lessons, patterns)
> 3. **Vault knowledge:** `D:/CodeApp/Projects/App_WebTADA/vault/thue-ke-toan/_index.md` + `_cheatsheet-thue-2026.md`
>
> | Thành phần | Khi nào nạp |
> |---|---|
> | Memory (Claude Code) | Tự động qua MEMORY.md |
> | Vault App_WebTADA | **Bắt buộc** — mỗi phiên mới hoặc `/resume-session` |
> | Vault knowledge (thuế) | **Bắt buộc** — khi viết bài blog hoặc check kiến thức |

**Nếu chưa thấy vault đã nạp:** gõ "nạp vault kiến thức" để Claude đọc từ vault.
