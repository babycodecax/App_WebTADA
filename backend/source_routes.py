"""
source_routes.py — FastAPI router quản lý kho nguồn tài liệu (source_documents).

Endpoints (prefix /api/admin/sources):
  GET    /api/admin/sources              — danh sách nguồn (filter + count compliance)
  POST   /api/admin/sources              — thêm nguồn mới (vault: auto-extract; upload/: chỉ metadata)
  DELETE /api/admin/sources?file_path=   — xoá nguồn + compliance_records liên quan
  POST   /api/admin/sources/re-extract   — extract lại 1 nguồn (thay mới compliance_records)

Xác thực: Bearer token (ADMIN_PASSWORD) giống upload_routes.py.
Tất cả thao tác nguồn vault đều đọc file .md từ vault (KHÔNG đụng vault,
chỉ đọc). Không dùng vector embedding — chỉ BM25.
"""
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from admin_auth import check_admin
from db import (
    delete_compliance_records_by_source,
    delete_source_document,
    get_all_source_documents,
    get_client,
    get_source_document_by_path,
    update_source_document_status,
    upsert_compliance_records,
    upsert_source_document,
)

logger = logging.getLogger("source_routes")

router = APIRouter(prefix="/api/admin/sources", tags=["admin-sources"])

VAULT_LAWS_DIR = os.getenv(
    "VAULT_LAWS_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vault", "thue-ke-toan"),
)

# Loại văn bản hợp lệ — khớp CHECK constraint trong migration 003
DOC_TYPES = ("luat", "nd", "tt", "nq", "vbhn", "other")
# Trạng thái hợp lệ — khớp CHECK constraint trong migration 003
SOURCE_STATUSES = ("ready", "processing", "error")

class SourceIn(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=500)
    title: str = ""
    doc_type: str = "other"
    effective_date: str = ""


class ReExtractIn(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=500)


def _validate_doc_type(doc_type: str) -> str:
    """Chuẩn hoá doc_type; không hợp lệ → HTTPException 422."""
    dt = (doc_type or "other").strip().lower()
    if dt not in DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type phải thuộc {list(DOC_TYPES)}")
    return dt


def _resolve_vault_path(file_path: str) -> str | None:
    """Resolve file_path dạng vault → đường dẫn tuyệt đối nếu tồn tại, else None.

    Chỉ chấp nhận đường dẫn trong VAULT_LAWS_DIR (chống path traversal).
    """
    if file_path.startswith("upload/"):
        return None  # nguồn upload không có file trên disk backend
    name = file_path.split("/")[-1]
    if not name or name.startswith("."):
        return None
    candidate = Path(VAULT_LAWS_DIR) / name
    try:
        resolved = candidate.resolve()
    except OSError:
        return None
    base = Path(VAULT_LAWS_DIR).resolve()
    if base not in resolved.parents and resolved != base:
        return None
    if not resolved.is_file():
        return None
    return str(resolved)


def _get_compliance_counts(client: Any, file_paths: list[str]) -> dict[str, int]:
    """Đếm compliance_records theo source_file cho danh sách file (1 query count)."""
    if not file_paths:
        return {}
    try:
        res = (
            client.table("compliance_records")
            .select("source_file,id", count="exact")
            .in_("source_file", file_paths)
            .execute()
        )
        rows = res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Đếm compliance_records thất bại (trả về 0): %s", exc)
        rows = []
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.get("source_file", "")] = counts.get(r.get("source_file", ""), 0) + 1
    return counts


def _do_extract_vault_file(file_path: str, abs_path: str, doc_type: str, title: str, effective_date: str) -> dict[str, Any]:
    """Extract 1 file vault → thay mới compliance_records + cập nhật source.

    Xoá records cũ TRƯỚC khi upsert (fix HIGH): upsert dedup theo
    (source_file, regulation) không xoá được bản ghi cũ khi file sửa đổi làm
    regulation thay đổi — sync cùng nguồn 2 lần phải thay toàn bộ, không giữ
    bản ghi hết hiệu lực. Lỗi extract → status=error, KHÔNG crash.
    """
    try:
        from knowledge_extractor import extract_from_file

        update_source_document_status(file_path, "processing")
        delete_compliance_records_by_source(file_path)
        records = extract_from_file(abs_path)
        n_uploaded = 0
        if records:
            n_uploaded = upsert_compliance_records(records)
        row = upsert_source_document(
            file_path=file_path,
            title=title,
            doc_type=doc_type,
            effective_date=effective_date,
            source_origin="vault",
            status="ready" if n_uploaded > 0 else "error",
        )
        return {"file_path": file_path, "records": len(records), "uploaded": n_uploaded, "source": row}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Extract nguồn %s thất bại", file_path)
        try:
            update_source_document_status(file_path, "error")
        except Exception:  # noqa: BLE001 — không che lỗi gốc
            pass
        raise HTTPException(status_code=500, detail=f"Extract {file_path} thất bại: {exc}") from exc


@router.get("")
async def list_sources(
    request: Request,
    doc_type: str = "",
    status: str = "",
    source_origin: str = "",
    search: str = "",
):
    """Danh sách nguồn tài liệu kèm số compliance_records đã extract.

    Bộ lọc: ?doc_type=, ?status=, ?source_origin=, ?search=<từ khoá title>.
    """
    check_admin(request)
    try:
        rows = get_all_source_documents()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lấy source_documents thất bại")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filtered: list[dict[str, Any]] = []
    for r in rows:
        if doc_type and r.get("doc_type", "") != doc_type:
            continue
        if status and r.get("status", "") != status:
            continue
        if source_origin and r.get("source_origin", "") != source_origin:
            continue
        if search:
            hay = f"{r.get('title', '')} {r.get('file_path', '')}".lower()
            if search.lower() not in hay:
                continue
        filtered.append(r)

    counts = _get_compliance_counts(get_client(), [r.get("file_path", "") for r in filtered])
    result = [{**r, "compliance_count": counts.get(r.get("file_path", ""), 0)} for r in filtered]
    return {"sources": result, "total": len(result)}


@router.post("")
async def add_source(request: Request, body: SourceIn):
    """Thêm 1 nguồn mới.

    - file_path thuộc vault: đọc file .md và extract compliance records ngay.
    - file_path prefix "upload/": chỉ ghi metadata (kiến thức đã extract ở luồng upload).
    """
    check_admin(request)
    file_path = body.file_path.strip().lstrip("/")
    doc_type = _validate_doc_type(body.doc_type)

    try:
        if not file_path.startswith("upload/"):
            abs_path = _resolve_vault_path(file_path)
            if abs_path is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Không tìm thấy file nguồn trong vault: {file_path}",
                )
            result = _do_extract_vault_file(
                file_path=file_path,
                abs_path=abs_path,
                doc_type=doc_type,
                title=body.title,
                effective_date=body.effective_date,
            )
            try:
                from compliance_search_engine import rebuild_compliance_index

                rebuild_compliance_index()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Rebuild compliance index thất bại: %s", exc)
            return JSONResponse(content={"ok": True, "source": result["source"], "records": result["records"]})

        # Nguồn upload: chỉ upsert metadata
        row = upsert_source_document(
            file_path=file_path,
            title=body.title,
            doc_type=doc_type,
            effective_date=body.effective_date,
            source_origin="upload",
        )
        return JSONResponse(content={"ok": True, "source": row})
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Thêm nguồn %s thất bại", file_path)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("")
async def delete_source(request: Request, file_path: str = ""):
    """Xoá nguồn + compliance_records liên quan + rebuild compliance index."""
    check_admin(request)
    if not file_path:
        raise HTTPException(status_code=400, detail="Thiếu tham số file_path")
    fp = file_path.strip()

    try:
        delete_compliance_records_by_source(fp)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Xoá compliance_records của %s thất bại: %s", fp, exc)

    try:
        deleted = delete_source_document(fp)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy nguồn: {fp}")

    try:
        from compliance_search_engine import rebuild_compliance_index

        rebuild_compliance_index()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Rebuild compliance index thất bại: %s", exc)
    return {"ok": True, "deleted": True}


@router.post("/re-extract")
async def re_extract_source(request: Request, body: ReExtractIn):
    """Extract lại 1 nguồn: xoá records cũ → extract mới → upsert → rebuild."""
    check_admin(request)
    file_path = body.file_path.strip().lstrip("/")
    if file_path.startswith("upload/"):
        raise HTTPException(
            status_code=400,
            detail="Nguồn upload không có file trên backend — hãy upload lại qua /api/admin/upload",
        )

    abs_path = _resolve_vault_path(file_path)
    if abs_path is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file nguồn trong vault: {file_path}")

    existing = get_source_document_by_path(file_path)
    doc_type = _validate_doc_type((existing or {}).get("doc_type", "other"))
    title = (existing or {}).get("title", "")
    effective_date = (existing or {}).get("effective_date", "")

    try:
        # 1) Extract lại + thay mới records (xoá cũ trước được làm trong
        #    _do_extract_vault_file — tránh bản ghi không còn hợp lệ)
        result = _do_extract_vault_file(file_path, abs_path, doc_type, title, effective_date)
        # 2) Rebuild compliance BM25 — chatbox dùng ngay
        try:
            from compliance_search_engine import rebuild_compliance_index

            rebuild_compliance_index()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Rebuild compliance index thất bại: %s", exc)
        return {"ok": True, "records": result["records"], "uploaded": result["uploaded"]}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Re-extract nguồn %s thất bại", file_path)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
