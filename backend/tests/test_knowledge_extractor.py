"""test_knowledge_extractor.py — Unit test cho hệ thống Knowledge Extraction.

TDD: viết test trước (RED), sau đó implement knowledge_extractor.py,
compliance_search_engine.py, llm_client format để test xanh (GREEN).

Các test đều mock OpenRouter/Supabase — không gọi API thật, không cần .env.
"""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from compliance_search_engine import (  # noqa: E402
    ComplianceEngine,
    _detect_numeric_query,
    _format_compliance_context,
    _has_numeric_value,
)
from knowledge_extractor import (  # noqa: E402
    ComplianceRecord,
    _build_extraction_prompt,
    _extract_numeric_values,
    _parse_llm_response,
    extract_from_file,
    extract_records_from_text,
)


# =========================================================================
# 1. _build_extraction_prompt — prompt đúng format cho 1 file luật mẫu
# =========================================================================

SAMPLE_FILE_MD = """---
title: NĐ 141/2026 — Sửa đổi thuế hộ KD
---
# NĐ 141/2026
## Tóm tắt
Nâng ngưỡng doanh thu từ 500 triệu lên 01 tỷ đồng.
## Chi tiết
Doanh thu năm > 01 tỷ bắt buộc dùng hóa đơn điện tử.
Miễn thuế TNDN cho doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng.
"""


def test_build_extraction_prompt_contains_key_elements() -> None:
    """Prompt phải chứa schema, nội dung file, yêu cầu JSON array."""
    prompt = _build_extraction_prompt("nd-141-2026.md", SAMPLE_FILE_MD)
    assert "nd-141-2026.md" in prompt
    assert "NĐ 141/2026" in prompt
    assert "numeric_values" in prompt
    assert "conditions" in prompt
    assert "legal_basis" in prompt
    assert "effective_date" in prompt
    assert "JSON" in prompt


def test_build_extraction_prompt_truncates_huge_file() -> None:
    """File quá dài phải được cắt để không vượt context LLM."""
    huge = SAMPLE_FILE_MD + ("x" * 20000)
    prompt = _build_extraction_prompt("nd-x.md", huge)
    # 15000 ký tự là hạn mức; câu trả lời phải nằm trong đó
    assert len(prompt) < 17000


# =========================================================================
# 2. _parse_llm_response — parse JSON response từ LLM thành records
# =========================================================================

LLM_JSON = """[
  {
    "topic": "Thuế TNDN - Miễn thuế doanh nghiệp nhỏ",
    "regulation": "Doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng được miễn thuế TNDN",
    "numeric_values": [
      {"label": "ngưỡng doanh thu miễn thuế", "value": 1, "unit": "tỷ đồng", "operator": "<="}
    ],
    "conditions": "Không áp dụng với công ty con có bên liên kết không đủ điều kiện",
    "legal_basis": "Khoản 15 Điều 4 NĐ 320/2025",
    "effective_date": "01/01/2026"
  },
  {
    "topic": "Hóa đơn điện tử hộ kinh doanh",
    "regulation": "Hộ kinh doanh doanh thu > 01 tỷ bắt buộc dùng hóa đơn điện tử",
    "numeric_values": [],
    "conditions": "",
    "legal_basis": "Khoản 5 Điều 8 NĐ 68/2026",
    "effective_date": "01/01/2026"
  }
]"""


def test_parse_llm_response_valid_json() -> None:
    """JSON hợp lệ → list ComplianceRecord đầy đủ field."""
    records = _parse_llm_response(LLM_JSON, "nd-141-2026.md")
    assert isinstance(records, list)
    assert len(records) == 2
    r0 = records[0]
    assert r0["source_file"] == "nd-141-2026.md"
    assert r0["topic"] == "Thuế TNDN - Miễn thuế doanh nghiệp nhỏ"
    assert r0["numeric_values"][0]["value"] == 1
    assert r0["numeric_values"][0]["unit"] == "tỷ đồng"
    assert r0["numeric_values"][0]["operator"] == "<="
    assert r0["legal_basis"] == "Khoản 15 Điều 4 NĐ 320/2025"
    assert r0["effective_date"] == "01/01/2026"
    assert r0["raw_chunk"]  # luôn có text gốc để index BM25


def test_parse_llm_response_with_markdown_fence() -> None:
    """LLM hay trả ```json ... ``` — phải bóc được fence."""
    fenced = "Đây là kết quả:\n```json\n" + LLM_JSON + "\n```"
    records = _parse_llm_response(fenced, "nd-x.md")
    assert len(records) == 2


def test_parse_llm_response_invalid_json() -> None:
    """JSON hỏng → trả về [] (không crash)."""
    assert _parse_llm_response("không phải json", "nd-x.md") == []


def test_parse_llm_response_empty_array() -> None:
    """Trả về [] → không lỗi."""
    assert _parse_llm_response("[]", "nd-x.md") == []


def test_parse_llm_response_filters_empty_regulation() -> None:
    """Record không có regulation (rỗng) → loại bỏ."""
    bad = '[{"topic": "x", "regulation": ""}]'
    assert _parse_llm_response(bad, "nd-x.md") == []


# =========================================================================
# 3. _extract_numeric_values — tách số liệu từ text
# =========================================================================


def test_extract_numeric_values_nguong_ty() -> None:
    vals = _extract_numeric_values("doanh thu từ 500 triệu lên 01 tỷ đồng")
    labels = [v["label"] for v in vals]
    # "500 triệu" và "01 tỷ" đều phải được tách
    assert any("500" in str(v["value"]) for v in vals if v["unit"] == "triệu")
    assert any(v["unit"] == "tỷ đồng" for v in vals)


def test_extract_numeric_values_percent_and_days() -> None:
    vals = _extract_numeric_values("thuế suất 15% và thời hạn 90 ngày")
    units = [v["unit"] for v in vals]
    assert "%" in units
    assert "ngày" in units


def test_extract_numeric_values_15m5() -> None:
    vals = _extract_numeric_values("ngưỡng thu nhập 15,5 triệu đồng/tháng")
    assert any(v["unit"] == "triệu đồng/tháng" for v in vals)
    assert any(v["value"] == "15,5" for v in vals)


# =========================================================================
# 4. extract_from_file — full pipeline 1 file, mock LLM
# =========================================================================


class _FakeResponse:
    def __init__(self, content: str) -> None:
        self._content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self._content}}]}


def test_extract_from_file_mocked_llm(tmp_path) -> None:  # type: ignore[no-untyped-def]
    md_file = tmp_path / "nd-141-test.md"
    md_file.write_text(SAMPLE_FILE_MD, encoding="utf-8")

    def fake_post(url: str, json: dict, headers: dict, timeout: float) -> _FakeResponse:
        assert "chat/completions" in url
        assert json["model"]
        assert json["stream"] is False
        return _FakeResponse(LLM_JSON)

    with patch("knowledge_extractor.requests.post", side_effect=fake_post):
        records = extract_from_file(str(md_file))

    assert isinstance(records, list)
    assert len(records) == 2
    assert records[0]["source_file"] == str(md_file)


def test_extract_from_file_llm_error_falls_back_to_heuristic(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """LLM call thất bại → fallback heuristic (không mất số liệu quan trọng)."""
    md_file = tmp_path / "nd-bad.md"
    md_file.write_text(SAMPLE_FILE_MD, encoding="utf-8")

    def fake_post(url: str, json: dict, headers: dict, timeout: float) -> _FakeResponse:
        raise RuntimeError("network down")

    with patch("knowledge_extractor.requests.post", side_effect=fake_post):
        records = extract_from_file(str(md_file))
    # SAMPLE_FILE_MD chứa "500 triệu" và "01 tỷ" → heuristic trích được records
    assert len(records) >= 1
    assert any("01 tỷ" in r["regulation"] or "500 triệu" in r["regulation"] for r in records)


def test_extract_from_file_retries_then_succeeds(tmp_path) -> None:  # type: ignore[no-untyped-def]
    md_file = tmp_path / "nd-retry.md"
    md_file.write_text(SAMPLE_FILE_MD, encoding="utf-8")

    calls = {"n": 0}

    def fake_post(url: str, json: dict, headers: dict, timeout: float) -> _FakeResponse:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return _FakeResponse(LLM_JSON)

    with patch("knowledge_extractor.requests.post", side_effect=fake_post):
        records = extract_from_file(str(md_file))
    assert len(records) == 2
    assert calls["n"] == 2  # đã retry 1 lần


def test_extract_from_file_rate_limits_between_chunks(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """MEDIUM fix: nhiều chunk trong cùng file phải sleep RATE_LIMIT_SECONDS
    giữa các lần gọi LLM (trước đây chỉ sleep khi retry → dễ 429 free tier)."""
    import knowledge_extractor as ke

    md_file = tmp_path / "nd-chunked.md"
    # File dài > 2 lần EXTRACT_CHUNK_CHARS → ít nhất 2 chunk
    md_file.write_text(SAMPLE_FILE_MD + ("\nSố liệu mốc 90 ngày, 15,5 triệu, 01 tỷ. " * 400), encoding="utf-8")

    def fake_post(url: str, json: dict, headers: dict, timeout: float) -> _FakeResponse:
        return _FakeResponse(LLM_JSON)

    with patch("knowledge_extractor.requests.post", side_effect=fake_post), \
         patch("knowledge_extractor.time.sleep") as mock_sleep:
        records = extract_from_file(str(md_file))
    assert len(records) >= 1
    # Số lần sleep = số lần gọi LLM - 1 (giữa các chunk), tối thiểu 1
    assert mock_sleep.call_count >= 1


# =========================================================================
# 5. extract_records_from_text — fallback heuristic khi LLM fail
# =========================================================================


def test_extract_records_from_text_extracts_numeric_lines() -> None:
    text = (
        "Ngưỡng doanh thu miễn thuế là 01 tỷ đồng.\n"
        "Thuế suất thuế TNDN là 20%.\n"
        "Thời hạn nộp là 90 ngày.\n"
        "Không có số liệu gì ở dòng này."
    )
    records = extract_records_from_text("nd-test.md", text)
    assert len(records) >= 3
    assert any("01 tỷ" in r["regulation"] for r in records)
    assert any("20%" in r["regulation"] for r in records)
    assert any("90 ngày" in r["regulation"] for r in records)


def test_extract_records_from_text_no_numbers() -> None:
    assert extract_records_from_text("nd-x.md", "Không có gì cả.") == []


# =========================================================================
# 6. ComplianceRecord — validation
# =========================================================================


def test_compliance_record_dataclass() -> None:
    rec = ComplianceRecord(
        source_file="nd-141.md",
        topic="Miễn thuế",
        regulation="Doanh thu ≤ 01 tỷ được miễn",
        numeric_values=[{"label": "ngưỡng", "value": 1, "unit": "tỷ đồng", "operator": "<="}],
        conditions="",
        legal_basis="Điều 4",
        effective_date="",
        raw_chunk="Doanh thu ≤ 01 tỷ được miễn",
    )
    assert rec.topic == "Miễn thuế"
    assert rec.numeric_values[0]["value"] == 1


# =========================================================================
# 7. ComplianceEngine — BM25 index + search
# =========================================================================

COMPLIANCE_ROWS = [
    {
        "id": "a1",
        "source_file": "nd-141-2026-ho-kinh-doanh-tndn.md",
        "topic": "Thuế TNDN - Miễn thuế doanh nghiệp nhỏ",
        "regulation": "Doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng được miễn thuế TNDN",
        "numeric_values": [{"label": "ngưỡng doanh thu", "value": 1, "unit": "tỷ đồng", "operator": "<="}],
        "conditions": "",
        "legal_basis": "Khoản 15 Điều 4 NĐ 320/2025",
        "effective_date": "01/01/2026",
        "raw_chunk": "Doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng được miễn thuế TNDN",
    },
    {
        "id": "a2",
        "source_file": "luat-109-2025-tncn.md",
        "topic": "Thuế TNCN - Biểu thuế lũy tiến",
        "regulation": "Giảm trừ gia cảnh 11 triệu đồng/tháng cho người nộp thuế",
        "numeric_values": [{"label": "mức giảm trừ", "value": 11, "unit": "triệu đồng/tháng", "operator": ""}],
        "conditions": "",
        "legal_basis": "Điều 7 Luật 109/2025",
        "effective_date": "01/01/2026",
        "raw_chunk": "Mức giảm trừ gia cảnh 11 triệu đồng/tháng",
    },
]


def test_compliance_engine_rebuild_and_search() -> None:
    engine = ComplianceEngine()
    engine.rebuild(COMPLIANCE_ROWS)
    results = engine.search("miễn thuế tndn doanh thu 1 tỷ")
    assert len(results) >= 1
    assert results[0]["id"] == "a1"


def test_compliance_engine_empty_index() -> None:
    engine = ComplianceEngine()
    assert engine.rebuild([]) == 0
    assert engine.search("bất kỳ") == []


def test_compliance_engine_no_rebuild_uses_empty() -> None:
    engine = ComplianceEngine()
    assert engine.search("gì đó") == []


# =========================================================================
# 8. _detect_numeric_query — nhận diện câu hỏi có số liệu/mốc
# =========================================================================


def test_detect_numeric_query() -> None:
    assert _detect_numeric_query("6 triệu có vượt ngưỡng 5 triệu không?")
    assert _detect_numeric_query("91 ngày có lớn hơn 90 ngày không?")
    assert _detect_numeric_query("thuế suất là bao nhiêu %?")
    assert _detect_numeric_query("cá nhân ở Việt Nam bao nhiêu ngày thì là cá nhân cư trú?")
    assert _detect_numeric_query("giảm trừ gia cảnh bao nhiêu tiền một tháng?")
    assert not _detect_numeric_query("hộ kinh doanh nộp thuế thế nào?")
    assert not _detect_numeric_query("thủ tục quyết toán thuế ra sao?")


def test_has_numeric_value() -> None:
    assert _has_numeric_value("01 tỷ đồng")
    assert _has_numeric_value("15,5 triệu")
    assert _has_numeric_value("90 ngày")
    assert _has_numeric_value("20%")
    assert not _has_numeric_value("không có số nào")


# =========================================================================
# 9. _format_compliance_context — format đặc biệt ưu tiên số liệu
# =========================================================================


def test_format_compliance_context() -> None:
    rec = {
        "id": "a1",
        "source_file": "nd-141.md",
        "topic": "Thuế TNDN - Miễn thuế doanh nghiệp nhỏ",
        "regulation": "Doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng được miễn thuế TNDN",
        "numeric_values": [{"label": "ngưỡng doanh thu", "value": 1, "unit": "tỷ đồng", "operator": "<="}],
        "conditions": "Không áp dụng công ty con",
        "legal_basis": "Khoản 15 Điều 4 NĐ 320/2025",
        "effective_date": "01/01/2026",
        "raw_chunk": "raw text",
    }
    out = _format_compliance_context([rec])
    assert "[DỮ LIỆU CÓ CẤU TRÚC" in out
    assert "Chủ đề: Thuế TNDN" in out
    assert "Quy định:" in out
    assert "Số liệu:" in out
    assert "ngưỡng doanh thu" in out
    assert "01 tỷ đồng" in out or "1 tỷ đồng" in out
    assert "Căn cứ: Khoản 15 Điều 4 NĐ 320/2025" in out


def test_format_compliance_context_empty() -> None:
    assert _format_compliance_context([]) == ""


# =========================================================================
# 10. llm_client — inject compliance context vào messages
# =========================================================================

from llm_client import _build_messages, _compliance_instruction  # noqa: E402


def test_llm_client_build_messages_with_compliance() -> None:
    compliance_ctx = (
        "[DỮ LIỆU CÓ CẤU TRÚC - ƯU TIÊN]\n"
        "Chủ đề: Thuế TNDN\n"
        "Quy định: doanh thu ≤ 01 tỷ được miễn thuế TNDN\n"
        "Số liệu: ngưỡng = 01 tỷ đồng\n"
        "Căn cứ: Điều 4 NĐ 320/2025\n"
    )
    instruction = _compliance_instruction()
    user_msg = (
        f"{compliance_ctx}\n\n{instruction}\n\n"
        "Tai lieu tham khao:\n\nCau hoi: 1,5 tỷ có được miễn thuế TNDN không?"
    )
    msgs = _build_messages("1,5 tỷ có được miễn thuế TNDN không?", [], compliance_context=user_msg)
    assert msgs[0]["role"] == "system"
    assert "so sánh" in msgs[0]["content"].lower() or "ĐỌC KỸ" in msgs[0]["content"]
    assert msgs[1]["role"] == "user"
    assert "DỮ LIỆU CÓ CẤU TRÚC" in msgs[1]["content"]
    assert "01 tỷ đồng" in msgs[1]["content"]
    assert "1,5 tỷ" in msgs[1]["content"]


def test_llm_client_build_messages_without_compliance() -> None:
    """Không có compliance context → message như cũ (không regression)."""
    msgs = _build_messages("hộ kinh doanh nộp thuế thế nào?", [{"file_path": "x.md", "title": "T", "heading": "H", "text": "nội dung"}])
    assert "Tai lieu tham khao:" in msgs[1]["content"]
    assert "DỮ LIỆU CÓ CẤU TRÚC" not in msgs[1]["content"]


# =========================================================================
# 11. db.py — upsert_compliance_records (mock Supabase client)
# =========================================================================


def test_upsert_compliance_records_mocked_db() -> None:
    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    with patch("db.get_client", return_value=fake_client):
        from db import upsert_compliance_records

        rows = [{"id": "x1", "source_file": "nd-1.md", "topic": "t", "regulation": "r", "raw_chunk": "c"}]
        upsert_compliance_records(rows)

    fake_client.table.assert_called_with("compliance_records")
    fake_client.table.return_value.upsert.assert_called_once()
    kwargs = fake_client.table.return_value.upsert.call_args[1]
    assert kwargs.get("on_conflict") == "source_file,regulation"


def test_get_all_compliance_records_mocked_db() -> None:
    fake_resp = MagicMock()
    fake_resp.data = [{"id": "x1", "source_file": "nd-1.md"}]
    fake_client = MagicMock()
    fake_client.table.return_value.select.return_value.execute.return_value = fake_resp

    with patch("db.get_client", return_value=fake_client):
        from db import get_all_compliance_records

        rows = get_all_compliance_records()

    assert rows == [{"id": "x1", "source_file": "nd-1.md"}]
    fake_client.table.assert_called_with("compliance_records")
    fake_client.table.return_value.select.assert_called_with("*")


# =========================================================================
# 12. main._compliance_context_for — merge compliance vào chat context
# =========================================================================


def test_compliance_context_for_numeric_question() -> None:
    """Câu hỏi có số liệu → compliance records chèn đầu context, chunk trùng file bị dedup."""
    from main import _compliance_context_for

    records = [
        {
            "source_file": "nd-141-2026-ho-kinh-doanh-tndn.md",
            "topic": "Thuế TNDN - Miễn thuế doanh nghiệp nhỏ",
            "regulation": "Doanh nghiệp có tổng doanh thu năm ≤ 01 tỷ đồng được miễn thuế TNDN",
            "numeric_values": [{"label": "ngưỡng doanh thu", "value": 1, "unit": "tỷ đồng", "operator": "<="}],
            "conditions": "",
            "legal_basis": "Khoản 15 Điều 4 NĐ 320/2025",
            "effective_date": "01/01/2026",
            "score": 1.0,
        }
    ]
    ctx = [
        {
            "file_path": "vault/nd-141-2026-ho-kinh-doanh-tndn.md",
            "text": "chunk cũ",
            "title": "T",
            "heading": "H",
            "score": 0.5,
        }
    ]
    orig = _compliance_context_for.__globals__["search_compliance"]
    try:
        _compliance_context_for.__globals__["search_compliance"] = lambda q: records  # type: ignore[assignment]
        merged, block = _compliance_context_for("1,5 tỷ có được miễn thuế TNDN không?", ctx)
    finally:
        _compliance_context_for.__globals__["search_compliance"] = orig

    assert len(merged) == 1  # compliance item thay chunk trùng file
    assert merged[0]["file_path"].startswith("compliance://")
    assert "Quy định:" in block
    assert "Số liệu:" in block


def test_compliance_context_for_non_numeric_unchanged() -> None:
    """Câu hỏi không có số liệu → context giữ nguyên, block rỗng (không regression)."""
    from main import _compliance_context_for

    ctx = [{"file_path": "x.md", "text": "c", "title": "T", "heading": "H", "score": 0.5}]
    merged, block = _compliance_context_for("hộ kinh doanh nộp thuế thế nào?", ctx)
    assert merged == ctx
    assert block == ""


def test_compliance_context_for_dedup_absolute_path() -> None:
    """HIGH fix: compliance source_file là đường dẫn TUYỆT ĐỐI, chunk file_path
    là đường dẫn tương đối — dedup phải so theo BASENAME (chuẩn hoá \\ → /)."""
    from main import _compliance_context_for

    records = [
        {
            "source_file": r"D:\CodeApp\Projects\App_WebTADA\vault\thue-ke-toan\nd-141-2026-ho-kinh-doanh-tndn.md",
            "topic": "Thuế TNDN",
            "regulation": "doanh thu ≤ 01 tỷ được miễn thuế TNDN",
            "numeric_values": [],
            "conditions": "",
            "legal_basis": "Điều 4",
            "effective_date": "",
            "score": 1.0,
        }
    ]
    ctx = [
        # Cùng basename (dạng đường dẫn tương đối có thư mục con) → phải bị dedup
        {"file_path": r"chung\nd-141-2026-ho-kinh-doanh-tndn.md", "text": "chunk cũ", "title": "T", "heading": "H", "score": 0.5},
        # File khác → giữ nguyên
        {"file_path": "vault/nd-68-2026.md", "text": "chunk khác", "title": "T2", "heading": "H2", "score": 0.5},
    ]
    orig = _compliance_context_for.__globals__["search_compliance"]
    try:
        _compliance_context_for.__globals__["search_compliance"] = lambda q: records  # type: ignore[assignment]
        merged, _block = _compliance_context_for("1,5 tỷ có được miễn thuế TNDN không?", ctx)
    finally:
        _compliance_context_for.__globals__["search_compliance"] = orig

    assert len(merged) == 2  # compliance item + chunk khác file
    assert merged[0]["file_path"].startswith("compliance://")
    assert merged[1]["file_path"] == "vault/nd-68-2026.md"


# =========================================================================
# 13. ComplianceRecord -> dict serialization
# =========================================================================


def test_compliance_record_to_dict() -> None:
    rec = ComplianceRecord(
        source_file="nd-141.md",
        topic="t",
        regulation="r",
        numeric_values=[],
        conditions="",
        legal_basis="",
        effective_date="",
        raw_chunk="r",
    )
    d = rec.to_dict()
    assert d["source_file"] == "nd-141.md"
    assert d["numeric_values"] == []
    assert "raw_chunk" in d
