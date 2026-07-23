"""main.py — FastAPI app cho Obsidian RAG Chatbox.

Phase 2: ingestion endpoint.
  POST /api/ingest  {"mode":"local","vault_dir":"..."}  -> ingest vault vào Supabase
Phase 3: chat endpoint.
  POST /api/chat    {"question":"...","top_k":5}        -> stream SSE (sources + token + done)
  GET  /            -> health check
"""
import hashlib
import hmac
import json
import logging
import os
import time
from collections import defaultdict
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ingestion import ingest_local
from search_engine import search, rebuild
from llm_client import stream_answer

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.main")
logging.basicConfig(level=logging.INFO)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# --- Rate limiter in-memory (sliding window, 30 req/phút/IP cho /api/*) ---
_rate_store: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60
_RATE_MAX = 30


async def rate_limit_middleware(request: Request, call_next: Any) -> Any:
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _rate_store[ip]
    while window and window[0] < now - _RATE_WINDOW:
        window.pop(0)
    if len(window) >= _RATE_MAX:
        return JSONResponse(
            status_code=429,
            content={"detail": "Quá nhiều request. Vui lòng thử lại sau 1 phút."},
        )
    window.append(now)
    return await call_next(request)


app = FastAPI(title="Obsidian RAG Chatbox", version="0.4.0")
app.middleware("http")(rate_limit_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "obsidian-chatbot", "phase": "4-frontend"}


@app.get("/api/config")
def config() -> dict[str, str]:
    """Cung cấp thông tin Supabase public cho frontend auth."""
    return {
        "supabaseUrl": os.getenv("SUPABASE_URL", ""),
        "supabaseAnonKey": os.getenv("SUPABASE_ANON_KEY", ""),
    }


class LogRequest(BaseModel):
    email: str = ""
    user_name: str = ""
    action: str = "question"       # "login" | "question"
    detail: str = ""               # nội dung câu hỏi
    question_count: int = 0
    ip_address: str = ""


@app.post("/api/log")
def api_log(req: LogRequest) -> dict[str, str]:
    """Ghi log hoạt động người dùng (login, câu hỏi)."""
    try:
        from db import get_client
        client = get_client()
        client.table("activity_logs").insert(req.model_dump()).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Log activity thất bại: %s", exc)
    return {"status": "ok"}


class IngestRequest(BaseModel):
    mode: str = "local"          # "local" (hiện tại) | "webhook" (Phase 5)
    vault_dir: str | None = None  # ghi đè VAULT_DIR nếu có
    signature: str | None = None  # X-Hub-Signature-256 (webhook mode)


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=10)


@app.post("/api/ingest")
def api_ingest(req: IngestRequest) -> dict[str, Any]:
    if req.mode == "local":
        vault_dir = req.vault_dir or os.getenv("VAULT_DIR", "")
        if not vault_dir or not os.path.isdir(vault_dir):
            raise HTTPException(
                status_code=400,
                detail=f"VAULT_DIR không hợp lệ hoặc chưa cấu hình: '{vault_dir}'",
            )
        try:
            result = ingest_local(vault_dir)
            try:
                result["reindexed"] = rebuild()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Rebuild index sau ingest thất bại: %s", exc)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Ingest local thất bại")
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return {"mode": "local", **result}

    if req.mode == "webhook":
        # Webhook mode chưa bật (Phase 5). Giữ sẵn hàm verify để tái dùng.
        secret = os.getenv("WEBHOOK_SECRET", "")
        if not secret or not _verify_signature(b"", req.signature or "", secret):
            raise HTTPException(status_code=401, detail="Webhook signature không hợp lệ")
        raise HTTPException(status_code=501, detail="Webhook ingest chưa được bật (Phase 5)")

    raise HTTPException(status_code=400, detail=f"Mode không hỗ trợ: {req.mode}")


@app.post("/api/chat")
def api_chat(req: ChatRequest) -> StreamingResponse:
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Thiếu câu hỏi")

    try:
        contexts = search(req.question, req.top_k)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Truy xuất thất bại")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not contexts:
        # Không tìm thấy tài liệu → báo luôn, không gọi LLM tránh hallucinate
        def empty_stream():
            yield "data: " + json.dumps({"type": "sources", "data": []}, ensure_ascii=False) + "\n\n"
            yield "data: " + json.dumps(
                {"type": "token", "data": "Xin lỗi, tôi không tìm thấy thông tin liên quan trong kho tri thức. Vui lòng thử lại với câu hỏi khác."},
                ensure_ascii=False,
            ) + "\n\n"
            yield "data: " + json.dumps({"type": "done"}, ensure_ascii=False) + "\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    def event_stream():
        sources = [
            {
                "title": c.get("title", ""),
                "heading": c.get("heading", ""),
                "file_path": c.get("file_path", ""),
                "score": c.get("score", 0.0),
            }
            for c in contexts
        ]
        yield "data: " + json.dumps({"type": "sources", "data": sources}, ensure_ascii=False) + "\n\n"
        try:
            for delta in stream_answer(req.question, contexts):
                yield "data: " + json.dumps({"type": "token", "data": delta}, ensure_ascii=False) + "\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.exception("Stream answer thất bại")
            yield "data: " + json.dumps({"type": "error", "data": str(exc)}, ensure_ascii=False) + "\n\n"
        finally:
            yield "data: " + json.dumps({"type": "done"}, ensure_ascii=False) + "\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _verify_signature(body_bytes: bytes, signature: str, secret: str) -> bool:
    """Xác thực X-Hub-Signature-256 (sha256 HMAC) cho GitHub webhook.

    FIXME: Hàm này dùng cho Phase 5 (webhook mode). Hiện tại chưa kích hoạt.
    Khi dùng, gọi với body_bytes = request body thật, KHÔNG phải signature string.
    """
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode(), msg=body_bytes, digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, f"sha256={expected}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
