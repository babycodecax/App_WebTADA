"""compliance_search_engine.py — BM25 riêng cho bản ghi quy định có cấu trúc.

Knowledge extraction sinh ra compliance_records (schema compliance_schema.json,
lưu Supabase). Module này:
  1) Index các records bằng BM25 (rank_bm25 + underthesea — KHÔNG embedding)
  2) Phát hiện câu hỏi có số liệu/mốc (_detect_numeric_query)
  3) Khi câu hỏi có số liệu: main.py gọi search_compliance + _format_compliance_context
     để chèn dữ liệu ưu tiên số liệu vào context LLM (LLM đọc trực tiếp thay
     vì tự suy luận — lỗi: deepseek-v4-flash không tự so sánh 91 > 90 ngày,
     6tr > 5tr).
"""
import logging
import re
from typing import Any

from rank_bm25 import BM25Okapi
from underthesea import word_tokenize

from db import get_all_compliance_records

logger = logging.getLogger("obsidian-chatbot.compliance")

COMPLIANCE_TOP_K = 6
MAX_CONTEXT_CHARS = 1800  # giới hạn text mỗi record khi đưa vào context

# Pattern số liệu/mốc trong câu hỏi: "01 tỷ", "15,5 triệu", "91 ngày", "6tr", "20%"
_NUMERIC_QUERY_RE = re.compile(
    r"\d{1,3}(?:[.,]\d+)?\s*(?:tỷ|triệu|tr|nghìn|ngàn|đồng|ngày|tháng|năm|tuần|giờ|%)",
    re.IGNORECASE,
)


def _tokenize(text: str) -> list[str]:
    """Tokenize tiếng Việt bằng underthesea; fallback regex nếu lỗi."""
    try:
        return [t.lower() for t in word_tokenize(text or "")]
    except Exception:  # noqa: BLE001
        return re.findall(r"[\w]+", (text or "").lower())


# =========================================================================
# Nhận diện câu hỏi có số liệu
# =========================================================================


def _has_numeric_value(text: str) -> bool:
    """Text có chứa số liệu/mốc (01 tỷ, 15,5 triệu, 90 ngày, 6%) không."""
    return bool(_NUMERIC_QUERY_RE.search(text or ""))


def _detect_numeric_query(question: str) -> bool:
    """Câu hỏi có chứa số liệu/mốc → cần ưu tiên compliance records."""
    q = (question or "").lower().strip()
    if not q:
        return False
    if _has_numeric_value(q):
        return True
    # Dấu % đứng riêng: "thuế suất là bao nhiêu %?"
    if re.search(r"%|phần trăm", q):
        return True
    # Câu hỏi lượng/giá trị: "bao nhiêu ngày/tiền/%", "mấy tháng"
    if re.search(r"bao nhiêu|mấy\s*(ngày|tháng|năm|tiền|triệu|tỷ|%)", q):
        return True
    # Câu hỏi số liệu nhưng số bị tách chữ: "sáu triệu", "một tỷ", "chín mươi ngày"
    return bool(re.search(r"(sáu|bảy|tám|chín|một|hai|ba|bốn|năm|mười)\s*(triệu|tỷ|nghìn|ngàn|ngày|tháng|năm|%|tr)", q))


# =========================================================================
# Format context
# =========================================================================


def _format_compliance_context(records: list[dict[str, Any]]) -> str:
    """Format records thành context đặc biệt ưu tiên số liệu cho LLM."""
    lines: list[str] = []
    for rec in records:
        lines.append("[DỮ LIỆU CÓ CẤU TRÚC - ƯU TIÊN]")
        lines.append(f"Chủ đề: {rec.get('topic', '')}")
        lines.append(f"Quy định: {rec.get('regulation', '')}")
        num_parts = []
        for v in rec.get("numeric_values") or []:
            label = v.get("label", "")
            val = v.get("value", "")
            unit = v.get("unit", "")
            op = v.get("operator", "")
            part = f"{label} = {val} {unit}".strip()
            if op:
                part += f" (điều kiện {op})"
            num_parts.append(part)
        if num_parts:
            lines.append("Số liệu: " + "; ".join(num_parts))
        cond = rec.get("conditions", "")
        if cond:
            lines.append(f"Điều kiện: {cond}")
        basis = rec.get("legal_basis", "")
        if basis:
            lines.append(f"Căn cứ: {basis}")
        eff = rec.get("effective_date", "")
        if eff:
            lines.append(f"Hiệu lực: {eff}")
        lines.append("")  # ngăn cách giữa các record

    # Giới hạn tổng context để không vượt cửa sổ LLM
    out = "\n".join(lines).strip()
    if len(out) > MAX_CONTEXT_CHARS * COMPLIANCE_TOP_K:
        out = out[: MAX_CONTEXT_CHARS * COMPLIANCE_TOP_K]
    return out


# =========================================================================
# BM25 engine
# =========================================================================


class ComplianceEngine:
    """BM25 index riêng cho compliance_records."""

    def __init__(self) -> None:
        self._records: list[dict[str, Any]] = []
        self._tokenized: list[list[str]] = []
        self._bm25: BM25Okapi | None = None

    def rebuild(self, records: list[dict[str, Any]] | None = None) -> int:
        """Nạp records (mặc định từ Supabase) và lập index BM25."""
        self._records = records if records is not None else get_all_compliance_records()
        self._tokenized = []
        for r in self._records:
            # Index topic + regulation + raw_chunk + legal_basis để match tốt
            text = " ".join(
                [
                    r.get("topic", ""),
                    r.get("regulation", ""),
                    r.get("raw_chunk", ""),
                    r.get("legal_basis", ""),
                ]
            )
            self._tokenized.append(_tokenize(text))
        self._bm25 = BM25Okapi(self._tokenized) if self._tokenized else None
        logger.info("Compliance BM25 rebuild xong: %d records", len(self._records))
        return len(self._records)

    def search(self, query: str, top_k: int = COMPLIANCE_TOP_K) -> list[dict[str, Any]]:
        """Top-k compliance records khớp query (BM25 + topic text match)."""
        if self._bm25 is None or not self._records:
            logger.debug("Chưa có compliance records để tìm kiếm")
            return []

        scores = self._bm25.get_scores(_tokenize(query))
        max_score = max(scores) if scores.size > 0 and max(scores) > 0 else 1.0
        # Tokenize query 1 lần trước vòng lặp (fix LOW: trước đây tokenize
        # lại cho từng record trong loop → tốn CPU với index lớn).
        q_terms = [t for t in _tokenize(query.lower()) if len(t) > 2]

        scored = []
        for i, base in enumerate(scores):
            norm = base / max_score
            rec = self._records[i]
            # Boost: record chứa topic/regulation khớp từ khoá query
            hay = " ".join(
                [rec.get("topic", ""), rec.get("regulation", ""), rec.get("raw_chunk", "")]
            ).lower()
            boost = 0.0
            for term in q_terms:
                if term in hay:
                    boost += 0.5
            scored.append((norm + boost, i))

        scored.sort(key=lambda x: x[0], reverse=True)
        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        for _score, i in scored:
            rec = self._records[i]
            rid = rec.get("id") or f"{rec.get('source_file')}|{rec.get('regulation')}"
            if rid in seen:
                continue
            seen.add(rid)
            text = rec.get("raw_chunk") or rec.get("regulation", "")
            results.append(
                {
                    "id": rid,
                    "source_file": rec.get("source_file", ""),
                    "topic": rec.get("topic", ""),
                    "regulation": rec.get("regulation", ""),
                    "numeric_values": rec.get("numeric_values") or [],
                    "conditions": rec.get("conditions", ""),
                    "legal_basis": rec.get("legal_basis", ""),
                    "effective_date": rec.get("effective_date", ""),
                    "text": text,
                    "score": float(_score),
                }
            )
            if len(results) >= top_k:
                break
        return results


_compliance_engine = ComplianceEngine()


def rebuild_compliance_index() -> int:
    """Rebuild index chia sẻ (gọi khi server start / ingest / extract)."""
    return _compliance_engine.rebuild()


def search_compliance(query: str, top_k: int = COMPLIANCE_TOP_K) -> list[dict[str, Any]]:
    """Hàm tiện ích: search trên engine chia sẻ."""
    return _compliance_engine.search(query, top_k)


