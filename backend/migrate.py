"""migrate.py — Chạy migration SQL lên Supabase.

PostgREST không cho chạy DDL (không có exec_sql RPC) nên script này:
  1) Thử chạy qua `psql` nếu có trên PATH (connection string từ SUPABASE_URL).
  2) Nếu không có psql → in hướng dẫn chạy bằng tay trong SQL Editor.

Cách chạy: cd backend && .venv\\Scripts\\activate.bat && python migrate.py
"""
import os
import shutil
import subprocess
import sys

from dotenv import load_dotenv

load_dotenv()

# Windows console mặc định cp1252 — ép UTF-8 để in tiếng Việt không lỗi
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

MIGRATIONS = [
    "migrations/2026-08-01-knowledge-chunks-unique.sql",
    "migrations/002_compliance_records.sql",
    "migrations/003_source_documents.sql",
]

# Lưu ý: migrations 002/003 dùng gen_random_uuid() (pgcrypto — có sẵn trong
# Supabase, bật mặc định). KHÔNG cần cài uuid-ossp extension thủ công.

# Tùy chọn: SUPABASE_PSQL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
CONN_STR = os.getenv("SUPABASE_PSQL", "")


def run_psql(sql_file: str) -> bool:
    psql = shutil.which("psql")
    if not psql or not CONN_STR:
        return False
    try:
        subprocess.run(
            [psql, CONN_STR, "-v", "ON_ERROR_STOP=1", "-f", sql_file],
            check=True,
            capture_output=True,
            text=True,
        )
        return True
    except subprocess.CalledProcessError as exc:
        print(f"  psql thất bại (stderr): {exc.stderr[-2000:]}")
        return False


def main() -> int:
    for sql_file in MIGRATIONS:
        print(f"=== Migration: {sql_file} ===")
        if not os.path.exists(sql_file):
            print(f"  [THIẾU FILE] {sql_file}")
            return 1

        if run_psql(sql_file):
            print("  OK — đã chạy qua psql.")
            continue

        print("  Không tìm thấy psql trên PATH hoặc chưa đặt SUPABASE_PSQL trong .env.")
        print("  → Chạy bằng tay: Supabase Dashboard → SQL Editor → dán nội dung file này → Run:")
        print(f"    {os.path.abspath(sql_file)}")
        print("  Xác nhận: SELECT conname FROM pg_constraint WHERE conname = 'knowledge_chunks_file_path_chunk_index_key';")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
