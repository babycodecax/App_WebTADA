"""llm_client.py — Gọi LLM qua OpenAI-compatible API.
Dùng chung cho OpenAI, Groq, OpenRouter, Together, Ollama, v.v.
Chỉ cần đổi biến môi trường, KHÔNG sửa code.
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

# === Cấu hình từ environment variables ===
LLM_API_KEY: str = os.getenv("LLM_API_KEY", os.getenv("OPENROUTER_KEY", ""))
LLM_API_BASE_URL: str = os.getenv("LLM_API_BASE_URL", "")
LLM_MODEL: str = os.getenv("LLM_MODEL", "")
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "1024"))
LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))

# Stream timeout: 30s giữa các token
_STREAM_SILENT_TIMEOUT = 30.0

# Nhận diện file nội bộ (cheatsheet, glossary, index) để che tên nguồn
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
    if re.search(r'cheatsheet|glossary|_index|Single Source of Truth', h, re.IGNORECASE):
        parts = h.split('>')
        if len(parts) > 1:
            h = parts[-1]
    h = re.sub(r'^[📌🔍📚📖⚖️💰✅❌⚠️➡️👉⭐🌟💡🆕📄🔹▪️]+', '', h).strip()
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
    """Yield từng đoạn text (delta) từ LLM qua OpenAI-compatible API."""
    if not LLM_API_KEY:
        raise RuntimeError(
            "Thiếu LLM_API_KEY (hoặc OPENROUTER_KEY) trong .env. "
            "Đặt tại: https://openrouter.ai/keys hoặc https://platform.openai.com/api-keys"
        )

    # Chuẩn hoá base_url: loại bỏ /chat/completions nếu người dùng vô tình thêm
    base = LLM_API_BASE_URL.rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    elif base.endswith("/v1"):
        pass  # ok
    elif not base.endswith("/v1"):
        base += "/v1"

    payload = {
        "model": LLM_MODEL,
        "messages": _build_messages(question, contexts),
        "stream": True,
        "max_tokens": LLM_MAX_TOKENS,
        "temperature": LLM_TEMPERATURE,
    }
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info("LLM call: %s, model=%s", base + "/chat/completions", LLM_MODEL)

    try:
        resp = requests.post(
            base + "/chat/completions",
            json=payload,
            headers=headers,
            stream=True,
            timeout=60,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gọi LLM thất bại")
        raise RuntimeError(f"LLM lỗi: {exc}") from exc

    # Set timeout cho stream
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
        logger.warning("Stream LLM bị gián đoạn: %s", exc)
