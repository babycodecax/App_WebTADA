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
MODEL_NAME: str = os.getenv("MODEL_NAME", "")
API_URL: str = "https://openrouter.ai/api/v1/chat/completions"
# Stream timeout: 30s giua cac token, neu qua lau thi tu dong cut
_STREAM_SILENT_TIMEOUT = 30.0

# Nhan dien file noi bo (cheatsheet, glossary, index) de che ten nguon
_INTERNAL_SOURCE_RE = re.compile(r'(?:^|[/\\])_?(?:cheatsheet|glossary|_index)', re.IGNORECASE)

_GENERIC_TITLE = "Văn bản pháp luật thuế/kế toán Việt Nam"


SYSTEM_PROMPT = (
    "Bạn là trợ lý hỏi đáp về thuế và kế toán Việt Nam. "
    "QUY TẮC (TUÂN THỦ NGHIÊM NGẶT):\n"
    "1. CHỈ dùng thông tin có trong tài liệu tham khảo bên dưới để trả lời. KHÔNG thêm thông tin không có trong tài liệu.\n"
    "2. Trả lời ngắn gọn trong 50 từ, đúng trọng tâm, bằng tiếng Việt, đi thẳng vào câu trả lời, không dẫn dắt.\n"
    "3. KHÔNG ghi [Nguồn X], (Nguồn X), hay bất kỳ ký hiệu trích dẫn nào trong câu trả lời. "
    "Viết nội dung thuần túy như bạn đang tư vấn trực tiếp.\n"
    "4. KHÔNG thêm bất kỳ mục \"Nguồn tham khảo\", \"Danh sách nguồn\", \"Nguồn\" hay danh sách tài liệu nào ở cuối câu trả lời.\n"
    "5. Nếu tài liệu chỉ đề cập một phần câu hỏi: trả lời phần có thông tin, nói rõ phần nào chưa có trong tài liệu.\n"
    "KHÔNG tự suy luận, KHÔNG bịa thông tin."
)


def _sanitize_heading(heading: str) -> str:
    """Bóc phần mô tả file nội bộ khỏi heading, chỉ giữ tên văn bản luật thực tế."""
    h = heading
    # Neu heading chua "cheatsheet" hoac "Single Source of Truth", lay phan sau ">" cuoi cung
    if re.search(r'cheatsheet|glossary|_index|Single Source of Truth', h, re.IGNORECASE):
        parts = h.split('>')
        if len(parts) > 1:
            h = parts[-1]  # lấy phần cuối sau ">" cuối
    # Xoá icon emoji đầu dòng
    h = re.sub(r'^[📌🔍📚📖⚖️💰✅❌⚠️➡️👉⭐🌟💡🆕📄🔹▪️]+', '', h).strip()
    # Xoá nội dung trong ngoặc đơn
    h = re.sub(r'\s*\([^)]*\)', '', h).strip()
    return h


def _build_messages(question: str, contexts: list[dict]) -> list[dict]:
    ctx_lines = []
    for i, c in enumerate(contexts):
        is_internal = bool(_INTERNAL_SOURCE_RE.search(c.get("file_path", "")))
        if is_internal:
            continue

        title = c.get("title", "")
        heading = c.get("heading", "")
        if not title:
            title = _GENERIC_TITLE
        else:
            title = _sanitize_heading(title)
        if heading:
            heading = _sanitize_heading(heading)
        ctx_lines.append(
            f"--- Tai lieu {i + 1} ---\n"
            f"Tieu de: {title}\n"
            f"Muc: {heading}\n"
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
