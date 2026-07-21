"""search_engine.py — Truy xuất BM25 + topic-boost trên chunks vault thuế.

Dùng underthesea tokenize tiếng Việt, rank BM25 (RankBM25) lấy top-k chunk
kèm provenance (file_path, title, heading). Cache chunks để không query
Supabase mỗi lần hỏi. Gọi rebuild() sau khi ingest xong.

Cải tiến (Phase 4.1): sau BM25, cộng điểm boost cho chunk có title/heading
chứa từ khóa quan trọng của query (topic relevance) — giúp chunk đúng chủ đề
(Luật TNCN, mốc 01 tỷ...) vượt lên trên các Thông tư lặp từ chung chung.
"""
import logging
import os
import re
from typing import Any

from rank_bm25 import BM25Okapi
from underthesea import word_tokenize

from db import get_all_chunks

logger = logging.getLogger("obsidian-chatbot.search")

TOP_K = 8

# Pattern tokenize dự phòng: match Unicode word (kể cả tiếng Việt có dấu)
_WORD_RE = re.compile(r"[\w]+", re.UNICODE)

# Stopword tiếng Việt + từ quá chung, không mang ý nghĩa chủ đề
_STOPWORDS = {
    "của", "và", "hoặc", "là", "được", "trong", "với", "cho", "năm", "các", "có",
    "theo", "tại", "từ", "để", "khi", "nào", "bao", "nhiêu", "làm", "sao", "thế",
    "nào", "mấy", "đó", "này", "như", "về", "còn", "đã", "sẽ", "đang", "bị", "không",
    "những", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười",
    "ngày", "tháng", "người", "cá", "nhân", "thu", "chi", "tiền", "đồng", "mức",
}

_TOPIC_KEYWORDS = {
    # ánh xạ từ gõ tắt / biến thể → từ khóa domain chuẩn trong vault
    "tncn": "thuế thu nhập cá nhân",
    "thuế tncn": "thuế thu nhập cá nhân",
    "thu nhập cá nhân": "thuế thu nhập cá nhân",
    "01 tỷ": "01 tỷ",
    "1 tỷ": "01 tỷ",
    "một tỷ": "01 tỷ",
    "miễn thuế": "miễn thuế",
    "mốc miễn": "miễn thuế",
    "gtgt": "thuế giá trị gia tăng",
    "giá trị gia tăng": "thuế giá trị gia tăng",
    "ttđb": "thuế tiêu thụ đặc biệt",
    "tiêu thụ đặc biệt": "thuế tiêu thụ đặc biệt",
    "tndn": "thuế thu nhập doanh nghiệp",
    "thu nhập doanh nghiệp": "thuế thu nhập doanh nghiệp",
    "hộ kinh doanh": "hộ kinh doanh",
    "quyết toán": "quyết toán thuế",
    "biểu thuế": "biểu thuế",
    "luật 109": "luật 109/2025/qh15",
    # Bổ sung thêm keyword thuế/kế toán
    "thuế suất": "thuế suất",
    "thuế suất ưu đãi": "thuế suất ưu đãi",
    "ưu đãi thuế": "ưu đãi thuế",
    "giảm thuế": "giảm thuế",
    "hoàn thuế": "hoàn thuế",
    "khấu trừ": "khấu trừ thuế",
    "khấu trừ thuế": "khấu trừ thuế",
    "kê khai": "kê khai thuế",
    "hóa đơn": "hóa đơn",
    "hóa đơn điện tử": "hóa đơn điện tử",
    "chứng từ": "chứng từ kế toán",
    "kỳ tính thuế": "kỳ tính thuế",
    "cá nhân cư trú": "cá nhân cư trú",
    "cá nhân không cư trú": "cá nhân không cư trú",
    "người phụ thuộc": "người phụ thuộc",
    "giảm trừ gia cảnh": "giảm trừ gia cảnh",
    "giảm trừ": "giảm trừ",
    "thu nhập chịu thuế": "thu nhập chịu thuế",
    "thu nhập miễn thuế": "thu nhập miễn thuế",
    "phạt vi phạm": "phạt vi phạm hành chính",
    "xử phạt": "xử phạt vi phạm",
    "thời hạn nộp": "thời hạn nộp thuế",
    "gia hạn": "gia hạn nộp thuế",
    "số thuế phải nộp": "số thuế phải nộp",
    "biểu thuế lũy tiến": "biểu thuế lũy tiến",
    "thuế tài sản": "thuế tài sản",
    "thuế xuất nhập khẩu": "thuế xuất nhập khẩu",
    "thuế bảo vệ môi trường": "thuế bảo vệ môi trường",
    "thuế môn bài": "thuế môn bài",
    "lệ phí trước bạ": "lệ phí trước bạ",
    "quyết toán thuế": "quyết toán thuế",
    "thông tư": "thông tư",
    "nghị định": "nghị định",
    "thông tư 111": "thông tư 111",
    "thông tư 80": "thông tư 80",
    "thông tư 78": "thông tư 78",
    "thông tư 219": "thông tư 219",
    "nghị định 126": "nghị định 126",
    "nghị định 123": "nghị định 123",
    "nghị định 125": "nghị định 125",
}


def _tokenize(text: str) -> list[str]:
    """Tokenize tiếng Việt bằng underthesea; fallback regex nếu lỗi."""
    try:
        return [t.lower() for t in word_tokenize(text or "")]
    except Exception:  # noqa: BLE001
        return _WORD_RE.findall((text or "").lower())


def _extract_query_terms(query: str) -> list[str]:
    """Trích các term quan trọng từ query (bỏ stopword + từ ngắn).

    Trả về list term, ưu tiên bắt các cụm topic dài trước (ví dụ 'thuế tncn').
    """
    q = (query or "").lower().strip()
    terms: list[str] = []
    q_work = q  # bản copy để tìm topic keyword, KHÔNG xoá từ gốc

    # 1) Bắt các cụm topic đã định nghĩa (ưu tiên dài → ngắn)
    #    Thêm mapped value (từ domain chuẩn trong vault) để BM25 match được
    #    heading/title thực tế.
    for phrase in sorted(_TOPIC_KEYWORDS, key=len, reverse=True):
        if phrase in q_work:
            terms.append(phrase)
            mapped = _TOPIC_KEYWORDS[phrase]
            if mapped != phrase:
                terms.append(mapped)
            # Chỉ xoá khỏi q_work để tránh match term con từ cụm đã bắt
            q_work = q_work.replace(phrase, " ")

    # 2) Các từ còn lại: tokenize, lọc stopword + từ ngắn (len <= 2)
    #    Dùng q (gốc, KHÔNG phải q_work đã bị xoá) để giữ đủ term
    for tok in _tokenize(q):
        if tok in _STOPWORDS or len(tok) <= 2:
            continue
        terms.append(tok)

    # Loại trùng, giữ thứ tự
    seen: set[str] = set()
    unique: list[str] = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    return unique


# Pattern phát hiện số liệu thuế cụ thể: "01 tỷ", "500 triệu", "15,5tr"...
_VALUE_PATTERN = re.compile(r"\d{1,3}(?:[.,]\d+)?\s*(tỷ|triệu|tr|nghìn|%|đồng)", re.IGNORECASE)
# Tên file tổng hợp (cheatsheet, index, glossary) — ưu tiên vì là nguồn tóm tắt chính xác
ALLOW_FILES_PER_SOURCE = 3  # dedup: tối đa 3 chunk/file
CHEATSHEET_PRIORITY = True  # ưu tiên file cheatsheet/index



def _topic_boost(chunk: dict[str, Any], terms: list[str]) -> float:
    """Điểm boost — topic match + thưởng chunk có số liệu cụ thể + tổng hợp."""
    title = (chunk.get("title") or "").lower()
    heading = (chunk.get("heading") or "").lower()
    text = (chunk.get("text") or "")[:3000].lower()
    boost = 0.0
    for term in terms:
        if term in heading:
            boost += 1.0
        if term in title:
            boost += 0.8
        if term in text:
            boost += 0.1

    # Thưởng chunk chứa số liệu cụ thể (ưu tiên trả lời chính xác)
    n_values = len(_VALUE_PATTERN.findall(text))
    boost += min(n_values * 0.5, 1.0)

    # Thưởng chunk từ file tổng hợp (cheatsheet, index, glossary)
    fname = os.path.splitext(os.path.basename(chunk.get("file_path", "")))[0]
    if fname.startswith("_cheatsheet") or fname.startswith("_index") or fname == "glossary":
        boost += 1.0

    return min(boost, 3.0)  # tối đa 3.0 để boost áp đảo BM25 noise


class SearchEngine:
    """BM25 over vault chunks (rebuild on demand), có topic-boost."""

    def __init__(self) -> None:
        self._chunks: list[dict[str, Any]] = []
        self._tokenized: list[list[str]] = []
        self._bm25: BM25Okapi | None = None

    def rebuild(self) -> int:
        """Nạp lại chunks từ Supabase và lập index BM25."""
        self._chunks = get_all_chunks()
        self._tokenized = []
        for c in self._chunks:
            # Index cả title + heading + text để BM25 match được metadata
            text = f"{c.get('title', '')} {c.get('heading', '')} {c.get('text', '')}"
            self._tokenized.append(_tokenize(text))
        self._bm25 = BM25Okapi(self._tokenized) if self._tokenized else None
        logger.info("BM25 rebuild xong: %d chunks", len(self._chunks))
        return len(self._chunks)

    def search(self, query: str, top_k: int = TOP_K) -> list[dict[str, Any]]:
        """Trả về top-k chunk (BM25 + topic-boost), kèm provenance.

        Dedup theo file_path: mỗi file tối đa ALLOW_FILES_PER_SOURCE chunk
        để giữ ngữ cảnh mà không bị một file lấn át hoàn toàn.
        """
        if self._bm25 is None:
            if not self._chunks:
                self.rebuild()
            if self._bm25 is None:
                logger.warning("Chưa có chunks để tìm kiếm")
                return []

        terms = _extract_query_terms(query)
        # Expand BM25 query: thêm mapped domain terms để BM25 match được
        # tài liệu dùng từ chuẩn (vd query="tncn" → thêm "thuế thu nhập cá nhân")
        query_expanded = query + " " + " ".join(terms)
        scores = self._bm25.get_scores(_tokenize(query_expanded))

        # Chuẩn hóa BM25 về [0, 1] rồi cộng topic boost
        max_score = max(scores) if scores.size > 0 and max(scores) > 0 else 1.0
        combined = []
        for i, base in enumerate(scores):
            norm = base / max_score  # normalize BM25
            boost = _topic_boost(self._chunks[i], terms)
            combined.append((norm + boost, i))

        # ====== BM25 phase: lấy top_k * 2 ======
        _candidate_count = max(top_k * 2, 16)
        combined.sort(key=lambda x: x[0], reverse=True)
        results: list[dict[str, Any]] = []
        seen_files: dict[str, int] = {}  # file_path -> số chunk đã lấy
        for score, i in combined:
            if len(results) >= _candidate_count:
                break
            if score <= 0:
                continue
            chunk = self._chunks[i]
            fpath = chunk.get("file_path", "")
            n_taken = seen_files.get(fpath, 0)
            if n_taken >= ALLOW_FILES_PER_SOURCE:
                continue  # dedup: tối đa N chunk/file
            seen_files[fpath] = n_taken + 1
            results.append(
                {
                    "text": chunk.get("text", ""),
                    "title": chunk.get("title", ""),
                    "file_path": fpath,
                    "heading": chunk.get("heading", ""),
                    "score": float(score),
                }
            )

        # ====== Re-rank phase: ưu tiên cheatsheet + file có số liệu + topic ======
        def _rerank_key(r: dict[str, Any]) -> float:
            r_text = (r.get("text") or "")[:3000].lower()
            r_heading = (r.get("heading") or "").lower()
            r_fname = os.path.basename(r.get("file_path", ""))
            r_title = (r.get("title") or "").lower()
            key = 0.0

            # 1) Cheatsheet luôn lên đầu (1 source truth)
            if r_fname.startswith("_cheatsheet") or r_fname == "glossary":
                key += 5.0
            if r_fname.startswith("_index"):
                key += 3.0

            # 2) Topic match (bow)
            for term in terms:
                if term in r_heading:
                    key += 1.0
                if term in r_title:
                    key += 0.8
                if term in r_text:
                    key += 0.2

            # 3) Giá trị cụ thể
            n_vals = len(_VALUE_PATTERN.findall(r_text))
            key += min(n_vals * 0.5, 1.5)

            # 4) BM25 score (đã normalize + boost sẵn)
            key += r.get("score", 0)

            return key

        results.sort(key=_rerank_key, reverse=True)
        return results[:top_k]


_engine = SearchEngine()


def search(query: str, top_k: int = TOP_K) -> list[dict[str, Any]]:
    """Hàm tiện ích: search trên engine chia sẻ."""
    return _engine.search(query, top_k)


def rebuild() -> int:
    """Hàm tiện ích: rebuild engine chia sẻ."""
    return _engine.rebuild()
