"""llm_client.py — Gọi LLM qua OpenAI-compatible API.
Dùng chung cho OpenAI, Groq, OpenRouter, Together, Ollama, v.v.
Chỉ cần đổi biến môi trường, KHÔNG sửa code.
"""
import json

import logging
import os
import re
import time
from typing import Iterator

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.llm")

# === Cấu hình từ environment variables ===
LLM_API_KEY: str = os.getenv("LLM_API_KEY", os.getenv("OPENROUTER_KEY", ""))
LLM_API_BASE_URL: str = os.getenv("LLM_API_BASE_URL", "")
LLM_MODEL: str = os.getenv("LLM_MODEL", "")
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))
LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.0"))

# Stream timeout: 30s giữa các token
_STREAM_SILENT_TIMEOUT = 60.0

# Nhận diện file nội bộ (cheatsheet, glossary, index) để che tên nguồn
_INTERNAL_SOURCE_RE = re.compile(r'(?:^|[/\\])_?(?:glossary|_index)', re.IGNORECASE)

_GENERIC_TITLE = "Văn bản pháp luật thuế/kế toán Việt Nam"

# Non-streaming helpers cho stream_answer
HEADERS = {
    "Authorization": f"Bearer {LLM_API_KEY}",
    "Content-Type": "application/json",
}
PAYLOAD_TEMPLATE = {
    "model": LLM_MODEL,
    "stream": False,
    "max_tokens": LLM_MAX_TOKENS,
    "temperature": LLM_TEMPERATURE,
}


def _api_url() -> str:
    """Chuẩn hoá base URL: luôn trả về …/v1 (không /chat/completions)."""
    base = LLM_API_BASE_URL.rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    elif not base.endswith("/v1"):
        base += "/v1"
    return base


SYSTEM_PROMPT = (
    "Bạn là trợ lý thuế/kế toán Việt Nam.\n"
    "Nhiệm vụ: trả lời CHÍNH XÁC dựa trên Tai lieu tham khao bên dưới.\n"
    "\n"
    "QUY TẮC:\n"
    "- Trích NGUYÊN VĂN số liệu, tên mẫu biểu trong tài liệu. KHÔNG sửa, KHÔNG suy luận.\n"
    "- Nếu câu hỏi yêu cầu tính toán → dùng đúng số trong tài liệu để tính.\n"
    "- Nếu tài liệu không có câu trả lời → báo 'Xin lỗi, tôi không tìm thấy thông tin phù hợp.'\n"
    "- KHÔNG tự ý sửa số, KHÔNG thêm số không có trong tài liệu.\n"
    "\n"
    "ĐỊNH DẠNG TRẢ LỜI (bắt buộc):\n"
    "- Trả lời 1-2 câu, tối đa 50 từ. Giải thích nhẹ nhưng đúng trọng tâm.\n"
    "- KHÔNG mở đầu bằng 'Theo...', 'Tài liệu...', 'Điều...', 'Bước...'.\n"
    "- KHÔNG thêm [Nguồn], <think>, markdown.\n"
    "- KHÔNG viết 'không có thông tin' — nói 'Xin lỗi, tôi không tìm thấy thông tin phù hợp.'\n"
    "- Câu CÓ/KHÔNG: chỉ 'Có' hoặc 'Không' kèm lý do ngắn.\n"
    "- Nếu hỏi số → đưa số kèm giải thích ngắn (VD: '15% — áp dụng cho doanh nghiệp trên 1 tỷ').\n"
    "- CUỐI câu trả lời, thêm 1 dòng: ghi tên văn bản luật đã dùng (VD: '(Căn cứ Luật số 67/2025/QH15)'). KHÔNG ghi điều cụ thể, KHÔNG ghi [Nguồn]."
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


_FORBIDDEN_PHRASES = [
    "không có thông tin",
    "không tìm thấy",
    "tài liệu không đề cập",
    "tài liệu không có",
    "không có câu trả lời",
    "không thể trả lời",
    "không có dữ liệu",
]

# Pattern strip <think>...</think> và các tag XML/HTML trong câu trả lời
_THINK_TAG_RE = re.compile(r'<think>.*?</think>', re.DOTALL | re.IGNORECASE)
_XML_TAG_RE = re.compile(r'<[^>]+>', re.IGNORECASE)


def _clean_answer(text: str) -> str:
    """Hậu xử lý: loại bỏ think tags, XML tags, chuẩn hoá khoảng trắng."""
    t = _THINK_TAG_RE.sub('', text)
    t = _XML_TAG_RE.sub('', t)
    t = re.sub(r'\s*\n\s*', '\n', t)
    t = re.sub(r'[ \t]+', ' ', t).strip()
    return t


def _has_forbidden_phrases(text: str) -> bool:
    """Kiểm tra câu trả lời có chứa cụm từ cấm không."""
    t = text.lower()
    for phrase in _FORBIDDEN_PHRASES:
        if phrase in t:
            return True
    return False


def _build_messages(question: str, contexts: list[dict], is_retry: bool = False) -> list[dict]:
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

    if is_retry:
        # Lần retry: prompt nghiêm ngặt hơn
        retry_instruction = (
            "\n\n=== YÊU CẦU BẮT BUỘC ===\n"
            "Lần trước bạn KHÔNG trả lời được. Lần này:\n"
            "1. Đọc KỸ tài liệu — câu trả lời NẰM TRONG tài liệu, hãy tìm.\n"
            "2. Số liệu/tên mẫu biểu → trích NGUYÊN VĂN từ tài liệu.\n"
            "3. TUYỆT ĐỐI KHÔNG bịa số, không sửa số.\n"
            "4. Nếu THẬT SỰ không có trong tài liệu → nói 'Xin lỗi, tôi không tìm thấy thông tin phù hợp.'"
        )
        user = f"Tai lieu tham khao:\n{ctx_text}\n\nCau hoi: {question}{retry_instruction}"
    else:
        user = f"Tai lieu tham khao:\n{ctx_text}\n\nCau hoi: {question}"
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _call_llm(messages: list[dict]) -> str:
    """Đồng bộ gọi LLM và trả về toàn bộ text."""
    base = LLM_API_BASE_URL.rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    elif not base.endswith("/v1"):
        base += "/v1"

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": False,
        "max_tokens": LLM_MAX_TOKENS,
        "temperature": LLM_TEMPERATURE,
    }
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            base + "/chat/completions",
            json=payload,
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM call (non-stream) thất bại: %s", exc)
        return ""


def _call_llm_stream_raw(messages: list[dict]) -> tuple[str, list[str]]:
    """Gọi LLM streaming, thu gom toàn bộ token trả về (full_text, raw_chunks).

    Trả về (full_text, raw_chunks) để caller có thể yield từng chunk nếu cần.
    Nếu lỗi, full_text = ''.
    """
    base = LLM_API_BASE_URL.rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    elif not base.endswith("/v1"):
        base += "/v1"

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": True,
        "max_tokens": LLM_MAX_TOKENS,
        "temperature": LLM_TEMPERATURE,
    }
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info("LLM call: %s, model=%s", base + "/chat/completions", LLM_MODEL)

    chunks: list[str] = []
    try:
        resp = requests.post(
            base + "/chat/completions",
            json=payload,
            headers=headers,
            stream=True,
            timeout=(5, 10),
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gọi LLM thất bại")
        raise RuntimeError(f"LLM lỗi: {exc}") from exc

    _raw = getattr(resp.raw, "_fp", None)
    _sock = getattr(_raw, "_sock", None) if hasattr(_raw, "_sock") else _raw
    if hasattr(_sock, "settimeout"):
        _sock.settimeout(_STREAM_SILENT_TIMEOUT)

    try:
        for raw_line in resp.iter_lines(timeout=10):
            if not raw_line:
                continue
            line = raw_line.decode("utf-8")
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
                delta = obj["choices"][0]["delta"].get("content", "")
                if delta:
                    chunks.append(delta)
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stream LLM bị gián đoạn: %s", exc)

    full_text = "".join(chunks)
    return full_text, chunks


def stream_answer(question: str, contexts: list[dict]) -> Iterator[str]:
    """Streaming LLM call, 2 attempts, tổng timeout 30s wall-clock.
    Thu gom token trước, yield sau khi quality pass.
    """
    if not LLM_API_KEY:
        raise RuntimeError(
            "Thiếu LLM_API_KEY (hoặc OPENROUTER_KEY) trong .env."
        )

    _TIMEOUT_MSG = "Hệ thống đang quá tải, xin vui lòng thử lại sau."
    _WALL = 30.0
    t_start = time.monotonic()

    for attempt in range(2):
        elapsed = time.monotonic() - t_start
        if elapsed >= _WALL - 1.0:
            yield _TIMEOUT_MSG
            return

        msg = _build_messages(question, contexts, is_retry=(attempt > 0))

        try:
            resp = requests.post(
                _api_url() + "/chat/completions",
                json={
                    "model": LLM_MODEL,
                    "messages": msg,
                    "stream": True,
                    "max_tokens": LLM_MAX_TOKENS,
                    "temperature": LLM_TEMPERATURE,
                },
                headers=HEADERS,
                stream=True,
                timeout=(min(25.0, _WALL - elapsed), 25.0),
            )
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("Attempt %d connect thất bại: %s", attempt + 1, exc)
            continue

        _raw = getattr(resp.raw, "_fp", None)
        _sock = getattr(_raw, "_sock", None) if hasattr(_raw, "_sock") else _raw
        remaining = _WALL - elapsed
        if hasattr(_sock, "settimeout"):
            _sock.settimeout(min(_STREAM_SILENT_TIMEOUT, remaining))

        # Collect all tokens first
        chunks: list[str] = []
        stream_ok = False
        try:
            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8")
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    stream_ok = True
                    break

                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0]["delta"].get("content", "")
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

                if not delta:
                    continue

                chunks.append(delta)

                # Check wall-clock after each token
                if time.monotonic() - t_start >= _WALL:
                    resp.close()
                    break
        except Exception as exc:
            logger.warning("Attempt %d stream gián đoạn: %s", attempt + 1, exc)
            continue

        full_text = "".join(chunks).strip()
        if full_text and not _has_forbidden_phrases(full_text):
            yield full_text
            return

        logger.warning("Attempt %d trả lời không đạt, retry...", attempt + 1)

    yield _TIMEOUT_MSG
