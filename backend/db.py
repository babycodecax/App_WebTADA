"""db.py — Supabase client wrapper cho Obsidian RAG Chatbox.

Kết nối Supabase qua biến môi trường, cung cấp các hàm upsert / đọc documents.
Mọi lỗi đều được log rõ ràng và ném RuntimeError có thông báo tiếng Việt.
"""
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.db")

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

_client: Optional[Client] = None


def get_client() -> Client:
    """Trả về Supabase client được cache; ném lỗi rõ ràng nếu chưa cấu hình."""
    global _client
    if _client is not None:
        return _client
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "Thiếu SUPABASE_URL hoặc SUPABASE_KEY. Hãy tạo Supabase free project, "
            "chạy schema.sql và điền vào file .env"
        )
    try:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Kết nối Supabase thành công")
        return _client
    except Exception as exc:  # noqa: BLE001
        logger.exception("Kết nối Supabase thất bại")
        raise RuntimeError(f"Không thể kết nối Supabase: {exc}") from exc


def upsert_document(file_path: str, title: str, content: str, chunks: list[dict[str, Any]]) -> None:
    """Insert hoặc update một dòng document, key theo file_path."""
    client = get_client()
    row = {
        "file_path": file_path,
        "title": title,
        "content": content,
        "chunks": chunks,
    }
    try:
        client.table("documents").upsert(row, on_conflict="file_path").execute()
        logger.info("Upsert thành công: %s (%d chunks)", file_path, len(chunks))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upsert thất bại: %s", file_path)
        raise RuntimeError(f"Upsert thất bại cho {file_path}: {exc}") from exc


def get_all_documents() -> list[dict[str, Any]]:
    """Trả về toàn bộ dòng documents (chỉ metadata, không chunks)."""
    client = get_client()
    try:
        res = client.table("documents").select("file_path,title,content,chunks").execute()
        return res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy danh sách documents thất bại")
        raise RuntimeError(f"Lấy documents thất bại: {exc}") from exc


def get_all_chunks() -> list[dict[str, Any]]:
    """Gộp tất cả chunks của mọi document thành 1 list có kèm nguồn (provenance)."""
    client = get_client()
    try:
        res = client.table("documents").select("file_path,title,chunks").execute()
        docs = res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy chunks thất bại")
        raise RuntimeError(f"Lấy chunks thất bại: {exc}") from exc

    flat: list[dict[str, Any]] = []
    for doc in docs:
        title = doc.get("title", "")
        fpath = doc.get("file_path", "")
        for idx, chunk in enumerate(doc.get("chunks") or []):
            flat.append(
                {
                    "file_path": fpath,
                    "title": title,
                    "index": idx,
                    "heading": chunk.get("heading", ""),
                    "text": chunk.get("text", ""),
                }
            )
    return flat
