"""llm_client.py — Gọi OpenRouter streaming (1 model free).

Stream từng token qua Server-Sent Events friendly generator.
Prompt ép model chỉ trả lời dựa trên tài liệu tham khảo, có cite nguồn.
"""
import json
import logging
import os
from typing import Iterator

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.llm")

OPENROUTER_KEY: str = os.getenv("OPENROUTER_KEY", "")
MODEL_NAME: str = os.getenv("MODEL_NAME", "qwen/qwen-2.5-7b-instruct:free")
API_URL: str = "http://localhost:20128/v1/chat/completions"
# Stream timeout: 30s giữa các token, nếu quá lâu thì tự động cut
_STREAM_SILENT_TIMEOUT = 30.0


SYSTEM_PROMPT = (
    "Bạn là trợ lý hỏi đáp thuế và kế toán Việt Nam. "
    "QUY TẮC (TUÂN THỦ NGHIÊM NGẶT):\n"
    "1. CHỈ dùng thông tin có trong tài liệu tham khảo bên dưới để trả lời. KHÔNG thêm thông tin không có trong tài liệu.\n"
    "2. Trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt, đi thẳng vào câu trả lời, không dẫn dắt.\n"
    "3. KHÔNG ghi [Nguồn X] hay bất kỳ ký hiệu trích dẫn nào trong đoạn trả lời. "
    "Viết nội dung thuần tuý.\n"
    "4. Nếu tài liệu chỉ đề cập một phần câu hỏi: trả lời phần có thông tin, nói rõ phần nào chưa có trong tài liệu.\n"
    "5. Nếu KHÔNG có thông tin trả lời trong tài liệu — nói thẳng 'Tài liệu hiện có không quy định/không đề cập vấn đề này', "
    "KHÔNG tự suy luận, KHÔNG bịa thông tin.\n"
    "6. Sau câu trả lời, cách 1 dòng và ghi '📚 Nguồn tham khảo:' rồi xuống dòng, liệt kê từng nguồn "
    "theo định dạng dấu gạch đầu dòng (-). Chỉ liệt kê 1 lần ở cuối, không rải rác."
)


def _build_messages(question: str, contexts: list[dict]) -> list[dict]:
    ctx_text = "\n\n".join(
        f"[Nguồn {i + 1}] {c.get('title', '')} > {c.get('heading', '')}\n{c.get('text', '')}"
        for i, c in enumerate(contexts)
    )
    user = f"Tài liệu tham khảo:\n{ctx_text}\n\nCâu hỏi: {question}"
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def stream_answer(question: str, contexts: list[dict]) -> Iterator[str]:
    """Yield từng đoạn text (delta) từ OpenRouter. Ném lỗi rõ ràng nếu fail."""
    if not OPENROUTER_KEY:
        raise RuntimeError("Thiếu OPENROUTER_KEY trong .env (lấy tại openrouter.ai/keys)")
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
        logger.exception("Gọi OpenRouter thất bại")
        raise RuntimeError(f"OpenRouter lỗi: {exc}") from exc

    # Set timeout cho stream để không treo nếu server ngừng gửi
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
        logger.warning("Stream OpenRouter bị gián đoạn: %s", exc)
