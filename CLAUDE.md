# App_WebTADA — Hệ thống Chatbot Thuế/Kế toán (1 project duy nhất)

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
