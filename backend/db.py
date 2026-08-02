"""db.py — Supabase client wrapper cho Obsidian RAG Chatbox.

Kết nối Supabase qua biến môi trường, cung cấp các hàm upsert / đọc documents.
Mọi lỗi đều được log rõ ràng và ném RuntimeError có thông báo tiếng Việt.
"""
import logging
import os
from datetime import datetime, timezone
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


def upsert_compliance_records(records: list[dict[str, Any]]) -> int:
    """Upsert compliance records lên bảng compliance_records.

    Mỗi record là dict theo schema compliance_schema.json. Trả về số
    records upsert thành công. Lỗi → RuntimeError tiếng Việt.
    """
    if not records:
        return 0
    client = get_client()
    rows = [
        {
            "source_file": r.get("source_file", ""),
            "topic": r.get("topic", ""),
            "regulation": r.get("regulation", ""),
            "numeric_values": r.get("numeric_values") or [],
            "conditions": r.get("conditions", ""),
            "legal_basis": r.get("legal_basis", ""),
            "effective_date": r.get("effective_date", ""),
            "raw_chunk": r.get("raw_chunk", ""),
        }
        for r in records
    ]
    try:
        client.table("compliance_records").upsert(rows, on_conflict="source_file,regulation").execute()
        logger.info("Upsert %d compliance records thành công", len(rows))
        return len(rows)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upsert compliance records thất bại")
        raise RuntimeError(f"Upsert compliance records thất bại: {exc}") from exc


def get_all_compliance_records() -> list[dict[str, Any]]:
    """Trả về toàn bộ compliance records (để rebuild BM25 index)."""
    client = get_client()
    try:
        res = client.table("compliance_records").select("*").execute()
        return res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy compliance records thất bại")
        raise RuntimeError(f"Lấy compliance records thất bại: {exc}") from exc


def delete_compliance_records_by_source(source_file: str) -> None:
    """Xoá compliance records của 1 file nguồn (khi file bị xoá / re-extract)."""
    client = get_client()
    try:
        client.table("compliance_records").delete().eq("source_file", source_file).execute()
        logger.info("Đã xoá compliance records của %s", source_file)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Xoá compliance records thất bại: %s", source_file)
        raise RuntimeError(f"Xoá compliance records của {source_file} thất bại: {exc}") from exc


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


# =========================================================================
# source_documents — kho quản lý nguồn tài liệu (vault + upload)
# =========================================================================

_SOURCE_FIELDS = "id,file_path,title,doc_type,effective_date,status,uploaded_at,source_origin,updated_at"

_DOC_TYPES = ("luat", "nd", "tt", "nq", "vbhn", "other")
_SOURCE_STATUSES = ("ready", "processing", "error")
_SOURCE_ORIGINS = ("vault", "upload")


def _now_iso() -> str:
    """Timestamp hiện tại dạng ISO 8601 (UTC) — dùng cho cột TIMESTAMPTZ.

    Trước đây truyền chuỗi 'now()' — PostgREST coi là literal, lưu chữ
    'now()' vào DB thay vì thời gian thật (updated_at sai cho tới khi
    column DEFAULT NOW() chạy).
    """
    return datetime.now(timezone.utc).isoformat()


def _validate_source_args(
    file_path: str,
    doc_type: str,
    status: str,
    source_origin: str,
) -> None:
    """Kiểm tra đầu vào hợp lệ trước khi ghi DB — fail fast, thông báo tiếng Việt."""
    if not file_path or not file_path.strip():
        raise ValueError("file_path không được rỗng")
    if doc_type not in _DOC_TYPES:
        raise ValueError(f"doc_type phải thuộc {_DOC_TYPES}, nhận: '{doc_type}'")
    if status not in _SOURCE_STATUSES:
        raise ValueError(f"status phải thuộc {_SOURCE_STATUSES}, nhận: '{status}'")
    if source_origin not in _SOURCE_ORIGINS:
        raise ValueError(f"source_origin phải thuộc {_SOURCE_ORIGINS}, nhận: '{source_origin}'")


def upsert_source_document(
    file_path: str,
    title: str = "",
    doc_type: str = "other",
    effective_date: str = "",
    source_origin: str = "vault",
    status: str = "ready",
) -> dict[str, Any]:
    """Upsert 1 nguồn vào source_documents theo file_path.

    Trả về row đã ghi (supabase trả list khi select sau upsert). Lỗi →
    RuntimeError tiếng Việt.
    """
    _validate_source_args(file_path, doc_type, status, source_origin)
    client = get_client()
    row = {
        "file_path": file_path.strip(),
        "title": (title or "").strip(),
        "doc_type": doc_type,
        "effective_date": (effective_date or "").strip(),
        "status": status,
        "source_origin": source_origin,
        "updated_at": _now_iso(),
    }
    try:
        res = (
            client.table("source_documents")
            .upsert(row, on_conflict="file_path")
            .select(_SOURCE_FIELDS)
            .execute()
        )
        data = res.data or []
        logger.info("Upsert source_document thành công: %s (%s)", file_path, doc_type)
        return data[0] if data else row
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upsert source_document thất bại: %s", file_path)
        raise RuntimeError(f"Upsert source_document thất bại cho {file_path}: {exc}") from exc


def get_all_source_documents() -> list[dict[str, Any]]:
    """Trả về toàn bộ source_documents (sắp xếp updated_at mới nhất trước)."""
    client = get_client()
    try:
        res = (
            client.table("source_documents")
            .select(_SOURCE_FIELDS)
            .order("updated_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy danh sách source_documents thất bại")
        raise RuntimeError(f"Lấy source_documents thất bại: {exc}") from exc


def get_source_document_by_path(file_path: str) -> dict[str, Any] | None:
    """Trả về 1 source_document theo file_path, None nếu không tồn tại."""
    client = get_client()
    try:
        res = (
            client.table("source_documents")
            .select(_SOURCE_FIELDS)
            .eq("file_path", file_path)
            .limit(1)
            .execute()
        )
        data = res.data or []
        return data[0] if data else None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy source_document thất bại: %s", file_path)
        raise RuntimeError(f"Lấy source_document {file_path} thất bại: {exc}") from exc


def delete_source_document(file_path: str) -> bool:
    """Xoá 1 nguồn khỏi source_documents theo file_path.

    Trả về True nếu có bản ghi bị xoá, False nếu không tồn tại.
    """
    client = get_client()
    try:
        res = (
            client.table("source_documents")
            .delete(count="exact")
            .eq("file_path", file_path)
            .execute()
        )
        deleted = res.count if res.count is not None else len(res.data or [])
        logger.info("Xoá source_document thành công: %s (%d)", file_path, deleted)
        return deleted > 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Xoá source_document thất bại: %s", file_path)
        raise RuntimeError(f"Xoá source_document {file_path} thất bại: {exc}") from exc


def update_source_document_status(file_path: str, status: str) -> dict[str, Any] | None:
    """Cập nhật status + updated_at của 1 nguồn. None nếu nguồn không tồn tại."""
    if status not in _SOURCE_STATUSES:
        raise ValueError(f"status phải thuộc {_SOURCE_STATUSES}, nhận: '{status}'")
    client = get_client()
    try:
        res = (
            client.table("source_documents")
            .update({"status": status, "updated_at": _now_iso()})
            .eq("file_path", file_path)
            .select(_SOURCE_FIELDS)
            .execute()
        )
        data = res.data or []
        logger.info("Cập nhật source_document %s → status=%s", file_path, status)
        return data[0] if data else None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Cập nhật status source_document thất bại: %s", file_path)
        raise RuntimeError(f"Cập nhật status source_document {file_path} thất bại: {exc}") from exc
