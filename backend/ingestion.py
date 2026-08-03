"""ingestion.py — Parse Markdown, cắt nhỏ (chunk) và ingest vault vào Supabase.

Luồng:
  chunk_document(path)      -> đọc 1 file .md -> {'file_path','title','content','chunks'}
  ingest_local(vault_dir)   -> đệ quy toàn bộ vault -> upsert từng file lên Supabase
  parse_markdown(content)   -> strip frontmatter, chunk theo heading ~500 tokens

Chunking giữ metadata `heading` (đường dẫn heading, vd "Chương 1 > Mục 2")
để Phase 3 có thể ghép ngữ cảnh khi truy xuất.
"""
import logging
import os
import re
from typing import Any

from db import get_client, upsert_document

logger = logging.getLogger("obsidian-chatbot.ingestion")

# --- Cấu hình ---
MAX_CHUNK_TOKENS = 1500  # dung hòa giữa ngữ cảnh và giới hạn upsert

# --- Regex ---
FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
TITLE_RE = re.compile(r"^title:\s*(.+)$", re.MULTILINE)
PARA_SPLIT_RE = re.compile(r"\n\s*\n")


def count_tokens(text: str) -> int:
    """Đếm từ (whitespace-split). Tiếng Việt đã cách từ nên khá chính xác,
    và nhanh hơn underthesea (tránh cold start lúc ingest hàng trăm file)."""
    return len(text.split())


def parse_markdown(content: str) -> tuple[str, str, list[dict[str, Any]]]:
    """Tách frontmatter, trả về (title, body, chunks)."""
    fm_match = FRONTMATTER_RE.match(content)
    frontmatter, body = "", content
    if fm_match:
        frontmatter = fm_match.group(1)
        body = content[fm_match.end():]

    title_match = TITLE_RE.search(frontmatter)
    title = ""
    if title_match:
        title = title_match.group(1).strip().strip('"').strip("'")

    chunks = _chunk_by_heading(body)
    return title, body.strip(), chunks


def _heading_path(stack: list[str]) -> str:
    return " > ".join(stack)


def _chunk_by_heading(body: str) -> list[dict[str, Any]]:
    """Cắt body thành các chunk theo cấu trúc heading H1-H6."""
    lines = body.split("\n")
    sections: list[tuple[str, str]] = []
    heading_stack: list[str] = []
    current_lines: list[str] = []

    def flush() -> None:
        if current_lines:
            text = "\n".join(current_lines).strip()
            if text:
                sections.append((_heading_path(heading_stack), text))
            current_lines.clear()

    for line in lines:
        m = HEADING_RE.match(line)
        if m:
            flush()
            level = len(m.group(1))
            text = m.group(2).strip()
            heading_stack = heading_stack[: level - 1]
            heading_stack.append(text)
        else:
            current_lines.append(line)
    flush()

    chunks: list[dict[str, Any]] = []
    for heading, text in sections:
        chunks.extend(_split_oversized(heading, text))
    return chunks


def _split_oversized(heading: str, text: str) -> list[dict[str, Any]]:
    """Nếu 1 section vượt MAX_CHUNK_TOKENS, cắt tiếp theo đoạn / theo từ."""
    if count_tokens(text) <= MAX_CHUNK_TOKENS:
        return [{"text": text, "heading": heading}]

    paragraphs = [p.strip() for p in PARA_SPLIT_RE.split(text) if p.strip()]
    chunks: list[dict[str, Any]] = []
    buf: list[str] = []
    buf_tokens = 0

    for para in paragraphs:
        pt = count_tokens(para)
        if buf and buf_tokens + pt > MAX_CHUNK_TOKENS:
            chunks.append({"text": "\n\n".join(buf), "heading": heading})
            buf, buf_tokens = [], 0
        if pt > MAX_CHUNK_TOKENS:
            words = para.split()
            for i in range(0, len(words), MAX_CHUNK_TOKENS):
                piece = " ".join(words[i : i + MAX_CHUNK_TOKENS])
                chunks.append({"text": piece, "heading": heading})
        else:
            buf.append(para)
            buf_tokens += pt

    if buf:
        chunks.append({"text": "\n\n".join(buf), "heading": heading})
    return chunks


def chunk_document(path: str) -> dict[str, Any]:
    """Đọc 1 file .md, parse và trả về dict sẵn sàng upsert."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
    except (OSError, UnicodeDecodeError) as exc:
        logger.error("Không thể đọc file %s: %s", path, exc)
        raise
    title, body, chunks = parse_markdown(content)
    if not title:
        title = os.path.splitext(os.path.basename(path))[0]
    return {
        "file_path": path,
        "title": title,
        "content": body,
        "chunks": chunks,
    }


def ingest_local(vault_dir: str) -> dict[str, Any]:
    """Đệ quy đọc toàn bộ vault .md và upsert từng file lên Supabase.

    Bỏ qua các nguồn đã bị xóa qua admin (status='deleted' trong
    source_documents) — chống kiến thức cũ tái sử dụng khi chạy lại ingest.
    """
    md_files: list[str] = []
    for root, _dirs, files in os.walk(vault_dir):
        for fn in files:
            if fn.lower().endswith(".md"):
                md_files.append(os.path.join(root, fn))

    # Nguồn soft-deleted qua admin — không re-ingest
    deleted_paths: set[str] = set()
    try:
        client = get_client()
        res = client.table("source_documents").select("file_path").eq("status", "deleted").execute()
        deleted_paths = {r.get("file_path", "") for r in (res.data or [])}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Không lấy được danh sách nguồn deleted (bỏ qua skip): %s", exc)

    if deleted_paths:
        before = len(md_files)
        md_files = [
            p for p in md_files
            if not any(p.replace("\\", "/").endswith(dp) for dp in deleted_paths)
        ]
        logger.info("Bỏ qua %d nguồn deleted: %s", before - len(md_files), sorted(deleted_paths))

    total = len(md_files)
    done = 0
    errors: list[dict[str, str]] = []

    logger.info("Bắt đầu ingest %d file từ %s", total, vault_dir)
    for path in md_files:
        try:
            doc = chunk_document(path)
            upsert_document(doc["file_path"], doc["title"], doc["content"], doc["chunks"])
            done += 1
            if done % 25 == 0:
                logger.info("Đã ingest %d/%d file", done, total)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Ingest thất bại: %s", path)
            errors.append({"file": path, "error": str(exc)})

    logger.info("Ingest xong: %d/%d thành công, %d lỗi", done, total, len(errors))
    return {"total": total, "ingested": done, "errors": errors}
