"""check_knowledge.py — Kiểm tra dữ liệu knowledge_chunks trên Supabase (chạy 1 lần).

Mục đích:
  1. Đếm tổng chunks — nếu > 1000 thì xác nhận chat route có thể bỏ sót
     chunks ngoài 1000 đầu (trừ khi thuộc file trọng yếu đã được load riêng).
  2. LIKE content theo các pattern số liệu quan trọng (giảm trừ / 01 tỷ / 50.000...).
  3. Trạng thái 6 file trọng yếu (file_path LIKE) — chunk tồn tại hay không.
  4. Kết luận: dữ liệu đủ (lỗi ở search/prompt) hay thiếu file (cần re-ingest
     qua POST /api/admin/upload).

Cách chạy: cd backend && .venv\\Scripts\\activate.bat && python check_knowledge.py
"""
import logging
import sys
import time
from typing import Any

from db import get_client

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

# Windows console mặc định cp1252 — ép UTF-8 để in tiếng Việt không lỗi
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Supabase giới hạn 1000 rows/request đối với select thường
ROW_LIMIT = 1000

# Các ý số liệu quan trọng cần có trong kho — LIKE theo nội dung
CHECK_PATTERNS = [
    "%giảm trừ gia cảnh%",
    "%15,5%",
    "%01 tỷ%",
    "%50.000%",
    "%miễn nộp%",
    "%trúng thưởng%",
    "%20 triệu%",
]

# 6 file trọng yếu — LIKE theo file_path (file_path vault = relative từ vault/thue-ke-toan/)
VITAL_FILES = [
    ("%luat-109%", "Luật 109/2025 (TNCN)"),
    ("%nd-68%", "NĐ 68/2026 hộ kinh doanh"),
    ("%nd-141%", "NĐ 141/2026 sửa NĐ 68"),
    ("%tt-89-2026-dieu-42%", "TT 89/2026 Điều 65 (miễn nộp ≤ 50.000)"),
    ("%cheatsheet%", "Cheatsheet thuế 2026"),
    ("%luat-thue-tncn%", "Luật thuế TNCN"),
]

FIELDS = "id, content, title, heading, file_path, chunk_index"

# Retry chống nhiễu: Supabase free worker thỉnh thoảng trả lỗi tạm
# (Cloudflare 1101 "Worker threw exception") — thử lại trước khi kết luận.
QUERY_RETRIES = 3
RETRY_DELAY = 2  # giây


def count_total(client) -> int:
    """Đếm tổng chunks trong knowledge_chunks."""
    try:
        res = client.table("knowledge_chunks").select("id", count="exact", head=True).execute()
        return int(res.count or 0)
    except Exception as exc:  # noqa: BLE001
        print(f"[LỖI] Không đếm được tổng chunks: {exc}")
        return -1


def _query_with_retry(client, query_fn) -> Any:
    """Chạy query với retry — lỗi tạm (Cloudflare 1101) không được tính là kết quả."""
    last_exc: Exception | None = None
    for attempt in range(1, QUERY_RETRIES + 1):
        try:
            return query_fn(), None
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            print(f"    (retry {attempt}/{QUERY_RETRIES} — {type(exc).__name__})")
            if attempt < QUERY_RETRIES:
                time.sleep(RETRY_DELAY)
    return None, last_exc


def check_content_patterns(client) -> None:
    """LIKE content theo từng pattern — in các chunks khớp (tối đa 20/pattern)."""
    for pattern in CHECK_PATTERNS:
        res, exc = _query_with_retry(
            client,
            lambda p=pattern: (
                client.table("knowledge_chunks")
                .select(FIELDS)
                .like("content", p)
                .limit(20)
                .execute()
            ),
        )
        if exc is not None:
            print(f"[LỖI QUERY] Pattern {pattern!r} thất bại sau {QUERY_RETRIES} lần: {exc}")
            continue

        rows = res.data or []
        print(f"\n=== Pattern {pattern} — {len(rows)} chunk ===")
        for r in rows[:5]:
            snippet = (r.get("content") or "")[:120].replace("\n", " ")
            print(f"  {r.get('file_path')} | {r.get('title')} | {r.get('heading')} | idx={r.get('chunk_index')}")
            print(f"    {snippet}...")


def check_vital_files(client) -> None:
    """Đếm chunks theo file_path cho 6 file trọng yếu."""
    print("\n=== 6 FILE TRỌNG YẾU ===")
    missing: list[str] = []
    query_errors: list[str] = []
    for pattern, label in VITAL_FILES:
        res, exc = _query_with_retry(
            client,
            lambda p=pattern: (
                client.table("knowledge_chunks")
                .select("id", count="exact", head=True)
                .like("file_path", p)
                .execute()
            ),
        )
        if exc is not None:
            # Lỗi query KHÔNG phải thiếu file (M1) — không đẩy vào missing
            print(f"  [LỖI QUERY] {label} ({pattern}) — thất bại sau {QUERY_RETRIES} lần: {exc}")
            query_errors.append(label)
            continue

        count = int(res.count or 0)
        status = f"{count} chunks" if count > 0 else "KHÔNG CÓ TRONG DB"
        print(f"  {label} ({pattern}) → {status}")
        if count == 0:
            missing.append(label)
    return missing, query_errors


def main() -> int:
    try:
        client = get_client()
    except RuntimeError as exc:
        print(f"[LỖI] {exc}")
        return 1

    print("=== TỔNG CHUNKS ===")
    total = count_total(client)
    if total < 0:
        return 1
    print(f"  Tổng chunks: {total}")
    if total > ROW_LIMIT:
        print(f"  CHÚ Ý: > {ROW_LIMIT} chunks — chat route chỉ load {ROW_LIMIT} đầu (page 1),")
        print("  chunks ngoài giới hạn chỉ được xét nếu thuộc file trọng yếu (load riêng).")

    missing, query_errors = check_vital_files(client)
    check_content_patterns(client)

    print("\n=== KẾT LUẬN ===")
    if query_errors:
        print(f"  [LỖI QUERY — KHÔNG kết luận được] {', '.join(query_errors)}")
        print("  → Lỗi Supabase tạm thời (Cloudflare 1101...), chạy lại script vài lần để loại nhiễu.")
        print("  → Chỉ khi lỗi lặp lại liên tục mới kiểm tra bảng/schema.")
    if not missing:
        print("  DỮ LIỆU ĐỦ — 6 file trọng yếu đều có chunks, lỗi nằm ở search/prompt.")
        print("  → Tiến hành sửa api/app/api/chat/route.ts (Bước B+C), không cần re-ingest.")
    else:
        print(f"  THIẾU FILE: {', '.join(missing)}")
        print("  → Re-ingest từng file thiếu qua POST /api/admin/upload")
        print("    (multipart file=.md từ vault, title=tên file, header Authorization: Bearer $ADMIN_PASSWORD).")
        print("  → Tránh chạy ingest-vault.js vì script xóa toàn bộ knowledge_chunks kể cả upload/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
