"""llm_client.py — Goi OpenRouter streaming (1 model free).

Stream tung token qua Server-Sent Events friendly generator.
Prompt ep model chi tra loi dua tren tai lieu tham khao, co cite nguon.
"""
import json
import logging
import os
import re
from typing import Iterator

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.llm")

OPENROUTER_KEY: str = os.getenv("OPENROUTER_KEY", "")
MODEL_NAME: str = os.getenv("MODEL_NAME", "qwen/qwen-2.5-7b-instruct:free")
API_URL: str = "http://localhost:20128/v1/chat/completions"
# Stream timeout: 30s giua cac token, neu qua lau thi tu dong cut
_STREAM_SILENT_TIMEOUT = 30.0

# Nhan dien file noi bo (cheatsheet, glossary, index) de che ten nguon
_CHEATSHEET_RE = re.compile(r'(?:^|[/\\])_?(?:cheatsheet|glossary|_index)', re.IGNORECASE)

_GENERIC_TITLE = "Văn bản pháp luật thuế/kế toán Việt Nam"


SYSTEM_PROMPT = (
    "Ban la tro ly hoi dap thue va ke toan Viet Nam. "
    "QUY TAC (TUAN THU NGHIEM NGAT):\n"
    "1. CHI dung thong tin co trong tai lieu tham khao ben duoi de tra loi. KHONG them thong tin khong co trong tai lieu.\n"
    "2. Tra loi ngan gon, dung trong tam, bang tieng Viet, di thang vao cau tra loi, khong dan dat.\n"
    "3. KHONG ghi [Nguon X] hay bat ky ky hieu trich dan nao trong doan tra loi. "
    "Viet noi dung thuan tuy.\n"
    "4. Neu tai lieu chi de cap mot phan cau hoi: tra loi phan co thong tin, noi ro phan nao chua co trong tai lieu.\n"
    "5. Neu KHONG co thong tin tra loi trong tai lieu — noi thang 'Tai lieu hien co khong quy dinh/khong de cap van de nay', "
    "KHONG tu suy luan, KHONG bia thong tin.\n"
    "6. Sau cau tra loi, cach 1 dong va ghi 'Nguon tham khao:' roi xuong dong, liet ke tung nguon "
    "theo dinh dang dau gach dau dong (-). Chi liet ke 1 lan o cuoi, khong rai rac.\n"
    "7. NGHIEM CAM dung ky hieu [Nguon X] trong toan bo cau tra loi. "
    "Phan nguon tham khao chi ghi ten tai lieu thuc te, khong them so thu tu.\n"
    "8. QUAN TRONG: Khi liet ke nguon tham khao, CHI duoc ghi ten van ban luat chinh thuc "
    "(Luật, Nghị định, Thông tư, Quyết định...) KHONG duoc ghi ten file noi bo, "
    "cheatsheet, glossary, index hay tai lieu tong hop. Neu noi dung lay tu tai lieu "
    "tong hop, ghi nguon la 'Văn bản pháp luật thuế/kế toán Việt Nam'."
)


def _build_messages(question: str, contexts: list[dict]) -> list[dict]:
    ctx_lines = []
    for i, c in enumerate(contexts):
        # Nếu chunk từ file nội bộ (cheatsheet, glossary, index) thì ẩn tên thật,
        # dùng tên chung để LLM không cite tên file internal ra người dùng
        title = _GENERIC_TITLE if _CHEATSHEET_RE.search(c.get("file_path", "")) else c.get("title", "")
        ctx_lines.append(
            f"--- Tai lieu {i + 1} ---\n"
            f"Tieu de: {title}\n"
            f"Muc: {c.get('heading', '')}\n"
            f"Noi dung:\n{c.get('text', '')}"
        )
    ctx_text = "\n\n".join(ctx_lines)
    user = f"Tai lieu tham khao:\n{ctx_text}\n\nCau hoi: {question}"
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def stream_answer(question: str, contexts: list[dict]) -> Iterator[str]:
    """Yield tung doan text (delta) tu OpenRouter. Nem loi ro rang neu fail."""
    if not OPENROUTER_KEY:
        raise RuntimeError("Thieu OPENROUTER_KEY trong .env (lay tai openrouter.ai/keys)")
    payload = {
        "model": MODEL_NAME,
        "messages": _build_messages(question, contexts),
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Obsidian RAG Chatbox",
    }
    try:
        resp = requests.post(
            API_URL, json=payload, headers=headers, stream=True, timeout=60
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Goi OpenRouter that bai")
        raise RuntimeError(f"OpenRouter loi: {exc}") from exc

    # Set timeout cho stream de khong tre neu server ngung gui
    _raw = getattr(resp.raw, "_fp", None)
    _sock = getattr(_raw, "_sock", None) if hasattr(_raw, "_sock") else _raw
    if hasattr(_sock, "settimeout"):
        _sock.settimeout(_STREAM_SILENT_TIMEOUT)

    try:
        for raw in resp.iter_lines():
            if not raw:
                continue
            line = raw.decode("utf-8")
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
                delta = obj["choices"][0]["delta"].get("content", "")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stream OpenRouter bi gian doan: %s", exc)
