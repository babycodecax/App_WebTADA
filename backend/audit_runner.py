"""
audit_runner.py — Gọi AIketoanthue audit engine qua subprocess.

Kiến trúc:
- File Excel BCTC được upload → lưu tạm trong backend/audit_uploads/
- Gọi AIketoanthue venv: python scripts/review_bctc.py <file.xlsx> [--cdps] [--html]
- Parse JSON output → trả về AuditReport

Tuân thủ:
- P1: Rule Engine deterministic (Python) phát hiện lỗi, không dùng AI.
- P2: Citation từ legal_kb local (SQLite FTS5), null nếu không có.
- P7: Error handling — crash → JSON lỗi, không chết server.
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("audit_runner")

# Đường dẫn tuyệt đối tới AIketoanthue project
AIKETOANTHUE_DIR = Path(r"D:\CodeApp\Projects\App_AIketoanthue")
SCRIPTS_DIR = AIKETOANTHUE_DIR / "scripts"
VENV_PYTHON = AIKETOANTHUE_DIR / "venv" / "Scripts" / "python.exe"
LEGAL_KB_PATH = AIKETOANTHUE_DIR / ".legal_kb" / "legal.db"

# Thư mục lưu file upload tạm
UPLOAD_DIR = Path(os.path.dirname(os.path.abspath(__file__))) / "audit_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Lưu kết quả audit (audit_id → JSON)
_results: Dict[str, Dict[str, Any]] = {}
_RESULTS_TTL = 3600  # 1 giờ


def _validate_venv() -> Optional[str]:
    """Kiểm tra môi trường AIketoanthue có sẵn không."""
    if not VENV_PYTHON.exists():
        return f"Không tìm thấy Python venv tại {VENV_PYTHON}"
    if not SCRIPTS_DIR.exists():
        return f"Không tìm thấy thư mục scripts tại {SCRIPTS_DIR}"
    return None


def run_audit(
    file_path: str,
    company_name: str = "",
    period: str = "auto",
    html_output: bool = False,
) -> Dict[str, Any]:
    """
    Chạy audit BCTC trên file Excel.

    Args:
        file_path: Đường dẫn file .xlsx
        company_name: Tên doanh nghiệp (tuỳ chọn)
        period: Kỳ báo cáo (VD "2024", "2024-Q4", "auto")
        html_output: Tạo báo cáo HTML kèm theo

    Returns:
        Dict với result (AuditReport JSON) hoặc error
    """
    err = _validate_venv()
    if err:
        return {"success": False, "error": err}

    if not os.path.isfile(file_path):
        return {"success": False, "error": f"File không tồn tại: {file_path}"}

    if not file_path.endswith(".xlsx"):
        return {"success": False, "error": "Chỉ hỗ trợ file .xlsx"}

    audit_id = f"audit_{uuid.uuid4().hex[:12]}"
    file_path_abs = os.path.abspath(file_path)
    logger.info("[%s] Bắt đầu audit: %s", audit_id, file_path_abs)

    try:
        cmd = [
            str(VENV_PYTHON),
            "-u",
            str(SCRIPTS_DIR / "review_bctc.py"),
            file_path_abs,
        ]

        if LEGAL_KB_PATH.exists():
            cmd.extend(["--db", str(LEGAL_KB_PATH)])
        else:
            # Tạo DB mới nếu chưa có
            cmd.append("--seed-demo")

        # CDPS: nếu file có sheet S06-DN hoặc CĐPS
        # Kiểm tra nhanh bằng openpyxl (thử option)
        has_cdps = _check_has_cdps_sheet(file_path)
        if has_cdps:
            logger.info("[%s] Phát hiện sheet CĐPS trong file", audit_id)
            cmd.extend(["--cdps", file_path])

        html_path = None
        if html_output:
            html_path = UPLOAD_DIR / f"{audit_id}.html"
            cmd.extend(["--html", str(html_path)])

        logger.info("[%s] Chạy lệnh: %s", audit_id, " ".join(cmd))

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(AIKETOANTHUE_DIR),
            env={**os.environ, "PYTHONUTF8": "1"},
        )

        if result.returncode != 0:
            stderr = result.stderr.strip() or "Không có thông tin lỗi"
            logger.error("[%s] Audit failed (rc=%d): %s", audit_id, result.returncode, stderr)
            return {
                "success": False,
                "error": f"Audit thất bại (mã {result.returncode}): {stderr}",
                "stderr": stderr,
                "audit_id": audit_id,
            }

        # Parse JSON từ stdout
        stdout = result.stdout.strip()
        if not stdout:
            return {
                "success": False,
                "error": "Không có output từ audit engine",
                "stderr": result.stderr.strip(),
                "audit_id": audit_id,
            }

        # Tìm JSON trong output (có thể có log lines)
        json_start = stdout.find("{")
        if json_start < 0:
            return {
                "success": False,
                "error": "Output không chứa JSON hợp lệ",
                "stdout": stdout[:1000],
                "audit_id": audit_id,
            }
        json_str = stdout[json_start:]

        report = json.loads(json_str)

        # Tổng hợp
        violations = report.get("violations", [])
        by_severity: Dict[str, int] = {}
        for v in violations:
            sev = v.get("severity", "unknown")
            by_severity[sev] = by_severity.get(sev, 0) + 1

        data = {
            "success": True,
            "audit_id": audit_id,
            "company_name": company_name or report.get("company_name") or "(từ file)",
            "period": report.get("period") or period,
            "total_violations": len(violations),
            "by_severity": by_severity,
            "violations": violations,
            "html_report": str(html_path) if html_path and html_path.exists() else None,
            "ran_at": time.time(),
        }

        # Cache result
        _results[audit_id] = data

        # Dọn cache cũ
        _cleanup_old_results()

        logger.info(
            "[%s] Audit xong: %d violations (critical=%d, high=%d)",
            audit_id,
            len(violations),
            by_severity.get("critical", 0),
            by_severity.get("high", 0),
        )

        return data

    except subprocess.TimeoutExpired:
        logger.error("[%s] Audit timeout (120s)", audit_id)
        return {"success": False, "error": "Audit quá thời gian 120 giây", "audit_id": audit_id}
    except json.JSONDecodeError as exc:
        logger.error("[%s] Parse JSON thất bại: %s", audit_id, exc)
        return {
            "success": False,
            "error": f"Parse kết quả audit thất bại: {exc}",
            "audit_id": audit_id,
        }
    except Exception as exc:
        logger.exception("[%s] Lỗi audit: %s", audit_id, exc)
        return {"success": False, "error": str(exc), "audit_id": audit_id}


def _check_has_cdps_sheet(file_path: str) -> bool:
    """Kiểm tra nhanh file Excel có sheet CĐPS (S06-DN) không."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet_names = [s.title.lower().strip() for s in wb.worksheets]
        wb.close()
        cdps_keywords = ["cdps", "s06", "cân đối phát sinh", "can doi phat sinh"]
        for name in sheet_names:
            for kw in cdps_keywords:
                if kw in name:
                    return True
        return False
    except Exception:
        return False


def get_result(audit_id: str) -> Optional[Dict[str, Any]]:
    """Lấy kết quả audit đã cache."""
    return _results.get(audit_id)


def list_results() -> list:
    """Danh sách audit gần đây."""
    now = time.time()
    return [
        {
            "audit_id": aid,
            "success": data.get("success", False),
            "company_name": data.get("company_name", ""),
            "total_violations": data.get("total_violations", 0),
            "by_severity": data.get("by_severity", {}),
            "ran_at": data.get("ran_at", 0),
        }
        for aid, data in sorted(_results.items(), key=lambda x: x[1].get("ran_at", 0), reverse=True)
        if now - data.get("ran_at", 0) < _RESULTS_TTL
    ]


def _cleanup_old_results():
    """Xoá kết quả cũ hơn _RESULTS_TTL."""
    now = time.time()
    stale = [
        aid for aid, data in _results.items()
        if now - data.get("ran_at", 0) >= _RESULTS_TTL
    ]
    for aid in stale:
        del _results[aid]
    # Xoá cả file upload cũ
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and f.name.endswith((".xlsx", ".html")):
            if now - f.stat().st_mtime > _RESULTS_TTL:
                try:
                    f.unlink()
                except OSError:
                    pass
