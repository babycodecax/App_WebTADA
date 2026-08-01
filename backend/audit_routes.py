"""
audit_routes.py — FastAPI router cho tính năng Kiểm toán BCTC.

Endpoints:
  POST /api/audit/upload   — upload file Excel BCTC, chạy audit, trả kết quả JSON
  GET  /api/audit/result/{id} — lấy kết quả audit đã chạy trước đó
  GET  /api/audit/history  — danh sách audit gần đây (trong bộ nhớ)

Tuân thủ kiến trúc TADA: FastAPI router, SSE streaming cho progress.
"""

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from audit_runner import UPLOAD_DIR, get_result, list_results, run_audit
from db import get_client

logger = logging.getLogger("audit_routes")

router = APIRouter(prefix="/api/audit", tags=["audit"])

ALLOWED_EXTENSIONS = {".xlsx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


class AuditStatusResponse(BaseModel):
    success: bool
    audit_id: str
    status: str = "completed"
    message: str = ""


@router.post("/upload")
async def audit_upload(request: Request, file: UploadFile = File(...)):
    """
    Upload file Excel BCTC và chạy audit.

    Yêu cầu:
    - File .xlsx (20 MB max)
    - Sheet mẫu: 'data BS' (B01), '3.PL' (B02), '4.CF(Indirect)-Quarterly' (B03)
    - Phải đăng nhập (Bearer token Supabase)

    Trả về:
    - AuditReport JSON với violations
    """
    # Bắt buộc đăng nhập — verify Supabase JWT
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Cần đăng nhập để sử dụng Rà soát BCTC")
    try:
        token = auth.replace("Bearer ", "")
        user = get_client().auth.get_user(token)
        if not user or not user.user or not user.user.email:
            raise HTTPException(status_code=401, detail="Phiên đăng nhập hết hạn, vui lòng đăng nhập lại")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập hết hạn, vui lòng đăng nhập lại") from None

    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Chỉ hỗ trợ file .xlsx. File của bạn: {ext or 'không xác định'}",
        )

    # Validate content-type
    if file.content_type and "spreadsheet" not in file.content_type and "octet-stream" not in file.content_type:
        logger.warning("Content-type bất thường: %s", file.content_type)

    # Đọc file vào bộ nhớ
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File quá lớn ({len(content) / 1024 / 1024:.1f} MB). Tối đa 20 MB.",
        )

    # Lưu file tạm
    unique_name = f"{uuid.uuid4().hex[:8]}_{file.filename or 'bctc.xlsx'}"
    dest = Path(str(UPLOAD_DIR)) / unique_name

    try:
        dest.write_bytes(content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lưu file thất bại: {exc}") from exc

    # Chạy audit
    result = run_audit(
        file_path=str(dest),
        company_name=file.filename or "",
        period="auto",
        html_output=True,
    )

    # Xoá file tạm sau khi audit
    try:
        dest.unlink(missing_ok=True)
    except OSError:
        pass

    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail={
                "error": result.get("error", "Audit thất bại"),
                "audit_id": result.get("audit_id"),
            },
        )

    return JSONResponse(content=result)


@router.get("/result/{audit_id}")
async def audit_result(audit_id: str):
    """Lấy kết quả audit theo ID."""
    data = get_result(audit_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy kết quả audit: {audit_id}")
    return JSONResponse(content=data)


@router.get("/history")
async def audit_history():
    """Danh sách audit gần đây."""
    results = list_results()
    return {"results": results, "count": len(results)}
