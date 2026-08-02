"""knowledge_extractor.py — Trích xuất bản ghi quy định có cấu trúc từ vault.

Đọc từng file .md luật trong vault/thue-ke-toan/, gửi tới LLM (OpenRouter,
model cấu hình trong .env — mặc định deepseek-v4-flash) với prompt yêu cầu
trả về JSON array các compliance records theo schema compliance_schema.json.

Số liệu/mốc (01 tỷ, 15,5 triệu, 90 ngày, 6%) được tách riêng field
numeric_values để LLM chat đọc trực tiếp thay vì tự suy luận (lỗi phổ biến
của model nhỏ: không so sánh được 91 > 90 ngày, 6tr > 5tr).

Kết quả:
  - lưu cache cục bộ backend/compliance_cache.json (để xem/chỉnh sửa)
  - upsert lên Supabase bảng compliance_records (deploy Vercel không phụ
    thuộc file cục bộ)

Chạy thủ công:
  cd backend && .venv\\Scripts\\activate.bat
  python knowledge_extractor.py                  # toàn bộ file luật
  python knowledge_extractor.py --limit 3        # chỉ 3 file đầu (test)
  python knowledge_extractor.py --no-upload      # chỉ ghi cache, không upload
"""
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.extractor")

# === Cấu hình ===
VAULT_LAWS_DIR: str = os.getenv(
    "VAULT_LAWS_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vault", "thue-ke-toan"),
)
CACHE_FILE: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "compliance_cache.json")

# Giới hạn 1 request / giây — OpenRouter free tier dễ 429
RATE_LIMIT_SECONDS: float = 1.0
MAX_RETRIES: int = 2
REQUEST_TIMEOUT: float = 300.0  # model reasoning max_tokens=16000 cần >120s (đo thực tế)
MAX_CONTENT_CHARS: int = 15000  # cắt file quá dài trước khi gửi LLM
# deepseek-v4-flash là reasoning model (trả reasoning_content): cần dư token
# cho phần suy luận + JSON output, nếu không finish_reason='length' → content rỗng.
# Đo thực tế: chunk 1500 chars kèm bảng markdown tiêu tới 7861+ reasoning tokens,
# max_tokens=8000/12000 → content rỗng; 16000 → trả đủ JSON (stop).
EXTRACT_MAX_TOKENS: int = 16000
# Chunk kích thước input cho mỗi lần gọi LLM: input lớn → reasoning tiêu tốn
# toàn bộ token, content rỗng (quan sát thực tế với 3K chars trên luat-48:
# 'content rỗng' liên tục 3 lần). Cắt ~1500 chars thì model luôn ra JSON hợp lệ
# (test thực tế: chunk 1500 chars từ luat-48 trả 2741 chars JSON đầy đủ).
EXTRACT_CHUNK_CHARS: int = 1500

# Chỉ extract các file luật thật sự (bỏ cheatsheet/index/glossary/template)
SKIP_FILE_PREFIXES: tuple[str, ...] = ("_cheatsheet", "_index", "glossary", "_template")

# Pattern dò số liệu trong văn bản (hỗ trợ "15,5 triệu đồng/tháng", "01 tỷ", "90 ngày", "20%")
_NUM_PATTERN = re.compile(
    r"\d{1,3}(?:[.,]\d+)?\s*"
    r"(?:tỷ|triệu|tr|nghìn|ngàn|đồng|ngày|tháng|năm|tuần|giờ|%)"
    r"(?:\s*đồng)?(?:\s*/\w+)*",
    re.IGNORECASE,
)

# === Khai báo log nếu chưa được cấu hình (chạy standalone) ===
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@dataclass
class ComplianceRecord:
    """Bản ghi quy định có cấu trúc — khớp schema compliance_schema.json."""

    source_file: str
    topic: str
    regulation: str
    numeric_values: list[dict[str, Any]] = field(default_factory=list)
    conditions: str = ""
    legal_basis: str = ""
    effective_date: str = ""
    raw_chunk: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_file": self.source_file,
            "topic": self.topic,
            "regulation": self.regulation,
            "numeric_values": self.numeric_values,
            "conditions": self.conditions,
            "legal_basis": self.legal_basis,
            "effective_date": self.effective_date,
            "raw_chunk": self.raw_chunk,
        }


_EXTRACTION_SYSTEM_PROMPT = (
    "Trích xuất quy định thuế/kế toán Việt Nam từ văn bản.\n"
    "Trả về JSON array. Mỗi phần tử gồm:\n"
    "{\"topic\": \"chủ đề ngắn\", \"regulation\": \"mô tả quy định 1-2 câu\", "
    "\"numeric_values\": [{\"label\": \"ý nghĩa\", \"value\": số giữ nguyên dạng văn bản, "
    "\"unit\": \"tỷ đồng|triệu đồng|ngày|%|...\", \"operator\": \"\"|\">\"|\"<\"|\">=\"|\"<=\"}], "
    "\"conditions\": \"điều kiện/ngoại lệ\", \"legal_basis\": \"điều/khoản/luật\", "
    "\"effective_date\": \"DD/MM/YYYY\"}\n"
    "QUY TẮC:\n"
    "1. Chỉ trích quy định có chuẩn mực (mốc, ngưỡng, thời hạn, điều kiện).\n"
    "2. Mọi số liệu quan trọng phải nằm trong numeric_values.\n"
    "3. KHÔNG bịa số. Trả về CHỈ JSON array, không markdown, không giải thích.\n"
    "4. Không có quy định đáng trích → trả về []."
)


def _build_extraction_prompt(file_name: str, content: str) -> str:
    """Tạo prompt extract cho 1 file luật (kèm mô tả schema compact)."""
    truncated = content if len(content) <= MAX_CONTENT_CHARS else content[:MAX_CONTENT_CHARS]
    return (
        f"File nguồn: {file_name}\n"
        "Văn bản:\n"
        f"\"\"\"\n{truncated}\n\"\"\"\n"
        "\nHãy trích xuất toàn bộ quy định quan trọng thành JSON array. "
        "Mỗi phần tử gồm các field: topic, regulation, numeric_values "
        "(mảng {label, value, unit, operator}), conditions, legal_basis, effective_date."
    )


def _call_llm_extract(file_name: str, content: str) -> str:
    """Gọi LLM (OpenRouter) trả về raw JSON string. Lỗi → ''."""
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENROUTER_KEY", "")
    base = (os.getenv("LLM_API_BASE_URL") or "").rstrip("/")
    model = os.getenv("LLM_MODEL") or ""
    if not api_key or not base or not model:
        logger.error("Thiếu LLM_API_KEY / LLM_API_BASE_URL / LLM_MODEL trong .env")
        return ""

    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    elif not base.endswith("/v1"):
        base += "/v1"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": _build_extraction_prompt(file_name, content)},
        ],
        "stream": False,
        "max_tokens": EXTRACT_MAX_TOKENS,
        "temperature": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(base + "/chat/completions", json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _strip_json_fence(text: str) -> str:
    """Bóc ```json ... ``` hoặc ``` ... ``` bao quanh JSON."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _parse_llm_response(raw: str, source_file: str) -> list[dict[str, Any]]:
    """Parse raw JSON từ LLM thành list record dict. Dữ liệu hỏng → []."""
    if not raw or not raw.strip():
        return []
    cleaned = _strip_json_fence(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # LLM hay kèm text thừa đầu/cuối — thử tìm đoạn JSON array đầu tiên
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if not m:
            logger.warning("LLM trả về không phải JSON (file %s)", source_file)
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            logger.warning("Không parse được JSON từ LLM (file %s)", source_file)
            return []

    if not isinstance(data, list):
        return []

    records: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        regulation = str(item.get("regulation") or "").strip()
        if not regulation:
            continue  # record không có nội dung → bỏ
        records.append(
            {
                "source_file": source_file,
                "topic": str(item.get("topic") or "").strip(),
                "regulation": regulation,
                "numeric_values": _normalize_numeric_values(item.get("numeric_values")),
                "conditions": str(item.get("conditions") or "").strip(),
                "legal_basis": str(item.get("legal_basis") or "").strip(),
                "effective_date": str(item.get("effective_date") or "").strip(),
                "raw_chunk": regulation,
            }
        )
    return records


def _normalize_numeric_values(raw: Any) -> list[dict[str, Any]]:
    """Chuẩn hoá numeric_values: giữ dict hợp lệ, bỏ phần tử rác."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for v in raw:
        if not isinstance(v, dict):
            continue
        label = str(v.get("label") or "").strip()
        value = v.get("value")
        unit = str(v.get("unit") or "").strip()
        if value is None or value == "":
            continue
        op = str(v.get("operator") or "").strip()
        if op not in (">", "<", ">=", "<=", "="):
            op = ""
        out.append({"label": label, "value": value, "unit": unit, "operator": op})
    return out


def _extract_numeric_values(text: str) -> list[dict[str, Any]]:
    """Tách số liệu (label, value, unit, operator) từ 1 câu text.

    Fallback heuristic khi LLM không trả numeric_values đầy đủ:
    dò pattern số + đơn vị trong text. Label được suy ra từ cụm từ ngay
    trước số (vd "mức giảm trừ 15,5 triệu" → label="mức giảm trừ").
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for m in _NUM_PATTERN.finditer(text or ""):
        hit = m.group(0).strip()
        if not hit or hit.lower() in seen:
            continue
        seen.add(hit.lower())
        parts = re.match(r"^([\d.,]+)\s*(.+)$", hit)
        if not parts:
            continue
        # Suy label từ 3 từ đơn phía trước (bỏ dấu câu, heading markers)
        before = (text[: m.start()] or "").strip()
        label = ""
        words = re.findall(r"[\wđĐ]+", before)
        if words:
            label = " ".join(words[-3:])
        out.append(
            {
                "label": label,
                "value": parts.group(1),
                "unit": parts.group(2).strip(),
                "operator": "",
            }
        )
    return out


def _call_llm_with_retry(file_name: str, content: str) -> str:
    """Gọi LLM có retry (MAX_RETRIES lần), rate limit 1 req/s.

    Retry cả khi: (a) lỗi mạng/API, (b) content rỗng — model reasoning
    thường xuyên tiêu hết token và trả content '' (finish_reason=length).
    """
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            time.sleep(RATE_LIMIT_SECONDS)
        try:
            raw = _call_llm_extract(file_name, content)
            if raw and raw.strip():
                return raw
            last_err = RuntimeError("LLM trả về content rỗng (finish_reason=length)")
            logger.warning("Extract %s lần %d: content rỗng — thử lại", file_name, attempt + 1)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("Extract %s lần %d thất bại: %s", file_name, attempt + 1, exc)
            time.sleep(RATE_LIMIT_SECONDS)
    logger.error("Extract %s thất bại sau %d lần thử (%s)", file_name, MAX_RETRIES + 1, last_err)
    return ""


def _extract_chunks(source_file: str, content: str, *, wait_between: float = 0.0) -> list[dict[str, Any]]:
    """Chunk + gọi LLM từng đoạn + gộp + dedup theo regulation.

    Dùng chung cho extract_from_file (đọc file) và extract_from_text (content
    có sẵn) — fix MEDIUM: trước đây 2 hàm lặp lại ~50 dòng logic giống hệt.
    Lỗi LLM ở 1 đoạn → fallback heuristic (không crash, không mất số liệu).
    wait_between: ngủ giữa các đoạn liên tiếp để tránh 429 trên free tier.
    """
    chunks = [
        content[i : i + EXTRACT_CHUNK_CHARS]
        for i in range(0, len(content), EXTRACT_CHUNK_CHARS)
    ]

    records: list[dict[str, Any]] = []
    n = len(chunks)
    for idx, chunk in enumerate(chunks, start=1):
        raw = _call_llm_with_retry(source_file, chunk)
        if not raw:
            # LLM call thất bại (network/API / finish_reason=length) → dùng
            # heuristic để không mất các số liệu quan trọng của đoạn này
            # (quan sát thực tế: model hay fail thoáng qua trên đoạn 2)
            logger.info("LLM fail %s đoạn %d — dùng fallback heuristic", source_file, idx)
            chunk_records = extract_records_from_text(source_file, chunk)
        else:
            chunk_records = _parse_llm_response(raw, source_file)
            if not chunk_records:
                logger.info("LLM không trả records cho %s đoạn %d — fallback heuristic", source_file, idx)
                chunk_records = extract_records_from_text(source_file, chunk)
        records.extend(chunk_records)
        # Rate limit GIỮA các đoạn trong cùng file (fix MEDIUM: trước đây chỉ
        # ngủ khi retry — nhiều đoạn liên tiếp gọi thẳng → dễ 429 trên free tier)
        if wait_between > 0 and idx < n:
            time.sleep(wait_between)

    # Dedup theo regulation (một quy định có thể xuất hiện ở nhiều đoạn)
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for r in records:
        key = r["regulation"].lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped


def extract_from_file(path: str) -> list[dict[str, Any]]:
    """Extract 1 file .md → list record dict. Lỗi nặng → [] (không crash).

    File quá dài được cắt thành nhiều đoạn (EXTRACT_CHUNK_CHARS) — mỗi đoạn
    gọi LLM 1 lần — vì model reasoning tiêu tốn token tỉ lệ với input (input
    lớn → content rỗng). Kết quả các đoạn gộp lại, dedup theo regulation.
    """
    try:
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
    except (OSError, UnicodeDecodeError) as exc:
        logger.error("Không đọc được file %s: %s", path, exc)
        return []

    # source_file dùng BASENAME (vd "luat-48-2024-gtgt.md") — khớp file_path
    # trong source_documents + API xoá theo path ngắn. Trước đây lưu full path
    # tuyệt đối → delete_compliance_records_by_source(path ngắn) không khớp,
    # records cũ không bị xoá → trùng lặp mỗi lần re-extract.
    return _extract_chunks(os.path.basename(path), content, wait_between=RATE_LIMIT_SECONDS)


def extract_from_text(source_file: str, content: str) -> list[dict[str, Any]]:
    """Extract records từ văn bản đã có sẵn (file upload qua web không lưu disk).

    Tương tự extract_from_file nhưng nhận content trực tiếp: cắt thành
    đoạn (EXTRACT_CHUNK_CHARS), gọi LLM từng đoạn, gộp + dedup theo
    regulation. Lỗi mạng → fallback heuristic (không crash).
    """
    if not content or not content.strip():
        return []

    return _extract_chunks(source_file, content, wait_between=RATE_LIMIT_SECONDS)


def extract_records_from_text(source_file: str, text: str) -> list[dict[str, Any]]:
    """Fallback heuristic: tách các câu chứa số liệu thành record tối thiểu."""
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in (text or "").splitlines():
        line = line.strip()
        line = re.sub(r"^[#>\-*\d.\s]+", "", line).strip()
        if len(line) < 20 or len(line) > 600:
            continue
        if not _NUM_PATTERN.search(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "source_file": source_file,
                "topic": "",
                "regulation": line,
                "numeric_values": _extract_numeric_values(line),
                "conditions": "",
                "legal_basis": "",
                "effective_date": "",
                "raw_chunk": line,
            }
        )
        if len(records) >= 30:
            break
    return records


# =========================================================================
# Cache cục bộ
# =========================================================================


def save_cache(records: list[dict[str, Any]]) -> None:
    """Ghi cache cục bộ JSON (để kiểm tra/chỉnh sửa thủ công)."""
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        logger.info("Đã lưu cache %d records vào %s", len(records), CACHE_FILE)
    except OSError as exc:
        logger.error("Không ghi được cache %s: %s", CACHE_FILE, exc)


def load_cache() -> list[dict[str, Any]]:
    """Đọc cache cục bộ nếu có."""
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return []


# =========================================================================
# Orchestration
# =========================================================================


def list_law_files(vault_dir: str = VAULT_LAWS_DIR) -> list[str]:
    """Liệt kê file luật .md trong vault (bỏ file tổng hợp/template)."""
    base = Path(vault_dir)
    if not base.is_dir():
        logger.warning("Thư mục vault không tồn tại: %s", vault_dir)
        return []
    files: list[str] = []
    for p in sorted(base.glob("*.md")):
        name = p.name
        if any(name.startswith(prefix) for prefix in SKIP_FILE_PREFIXES):
            continue
        files.append(str(p))
    return files


def extract_vault(vault_dir: str = VAULT_LAWS_DIR, limit: int | None = None) -> list[dict[str, Any]]:
    """Extract toàn bộ (hoặc limit file) vault → list records đã ghi cache.

    - Ghi cache ngay sau mỗi file (chạy dài không mất dữ liệu nếu bị gián đoạn).
    - File nào trả 0 records (model reasoning thất bại thoáng qua) được thử lại
      ở vòng 2 — model này hay fail 3 lần liên tiếp trên cùng 1 file.
    """
    files = list_law_files(vault_dir)
    if limit is not None and limit >= 0:
        files = files[:limit]

    # Resume: bỏ file đã có records trong cache (chạy lại sau khi gián đoạn
    # không phải extract lại toàn bộ). File cache 0 records vẫn thử lại.
    cached = load_cache()
    cached_sources: dict[str, int] = {}
    for r in cached:
        sf = r.get("source_file", "")
        if sf:
            cached_sources[sf] = cached_sources.get(sf, 0) + 1
    done = {os.path.basename(p): cached_sources.get(os.path.basename(p), 0) for p in files}
    pending = [p for p in files if done.get(os.path.basename(p), 0) == 0]
    skipped = len(files) - len(pending)
    if skipped:
        logger.info("Resume: bỏ qua %d file đã có records trong cache", skipped)
    files = pending

    all_records = [r for r in cached]  # giữ records cache cũ, thêm records mới
    file_stats: list[dict[str, Any]] = []

    def _run_pass(file_list: list[str], first_pass: bool) -> None:
        nonlocal all_records, file_stats
        for idx, path in enumerate(file_list, start=1):
            try:
                records = extract_from_file(path)
                all_records.extend(records)
                file_stats.append({"file": os.path.basename(path), "records": len(records)})
                logger.info(
                    "[%s %d/%d] %s → %d records",
                    "pass1" if first_pass else "pass2",
                    idx, len(file_list), os.path.basename(path), len(records),
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Extract %s lỗi không lường trước", path)
                file_stats.append({"file": os.path.basename(path), "records": 0, "error": str(exc)})
            # rate limit giữa các file
            if idx < len(file_list):
                time.sleep(RATE_LIMIT_SECONDS)
            # Ghi cache ngay sau mỗi file để không mất khi bị gián đoạn
            save_cache(all_records)

    _run_pass(files, first_pass=True)

    # Vòng 2: thử lại các file 0 records (model reasoning hay fail thoáng qua)
    failed = [
        os.path.join(vault_dir, s["file"])
        for s in file_stats
        if s["records"] == 0 and os.path.isdir(vault_dir)
    ]
    if failed:
        logger.info("Vòng 2: thử lại %d file chưa có records", len(failed))
        _run_pass(failed, first_pass=False)

    ok = sum(1 for s in file_stats if s["records"] > 0)
    logger.info(
        "Extract xong: %d/%d file có records, tổng %d records",
        ok, len(files), len(all_records),
    )
    return all_records


def upsert_to_supabase(records: list[dict[str, Any]]) -> int:
    """Upsert records lên Supabase. Trả về số records thành công."""
    try:
        from db import upsert_compliance_records
    except ImportError:
        logger.warning("Không import được db.py — bỏ qua upsert (chạy với --no-upload?)")
        return 0
    try:
        return upsert_compliance_records(records)
    except Exception as exc:  # noqa: BLE001
        logger.error("Upsert compliance lên Supabase thất bại: %s", exc)
        return 0


# =========================================================================
# CLI
# =========================================================================


def main() -> None:
    """Chạy extract từ command line."""
    import argparse

    parser = argparse.ArgumentParser(description="Knowledge Extraction từ vault thuế/kế toán")
    parser.add_argument("--vault-dir", default=VAULT_LAWS_DIR, help="Thư mục vault luật")
    parser.add_argument("--limit", type=int, default=None, help="Chỉ extract N file đầu (debug)")
    parser.add_argument("--no-upload", action="store_true", help="Không upload Supabase, chỉ ghi cache")
    args = parser.parse_args()

    records = extract_vault(args.vault_dir, limit=args.limit)
    print(f"Tổng records extract: {len(records)}")

    if not args.no_upload:
        n = upsert_to_supabase(records)
        print(f"Upload Supabase thành công: {n}/{len(records)}")


if __name__ == "__main__":
    main()
