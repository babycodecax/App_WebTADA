# App_WebTADA — Hệ thống Chatbot Thuế/Kế toán

1 project duy nhất — 3 thành phần:

| Thành phần | Vị trí | Chức năng |
|------------|--------|-----------|
| **Frontend Web** | `/index.html`, `/css/`, `/js/` | Landing page + chatbox |
| **Next.js Proxy** | `/api/` | Proxy request từ web → backend |
| **RAG Backend** | `/backend/` | FastAPI + BM25 + OpenRouter |
| **Kho tri thức** | `/vault/thue-ke-toan/` | Notes .md về thuế/kế toán |

## Khởi động

### Backend (Python FastAPI)
```cmd
cd backend
.venv\Scripts\activate.bat
python main.py
```

### Frontend
Mở `index.html` trong trình duyệt hoặc chạy Live Server.
