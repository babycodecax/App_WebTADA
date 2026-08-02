"""test_source_documents.py — Unit test cho kho quản lý nguồn tài liệu.

Coverage:
  1) db.py — 5 hàm source_documents mới (mock Supabase client)
  2) source_routes.py — 4 endpoint API (FastAPI TestClient + mock db/extractor)
  3) upload_routes.py — luồng upload có auto-extract (mock toàn bộ external)
  4) sync_44_sources.py — helper scan/classify/parse + luồng sync (mock requests)

Tất cả test đều mock Supabase / OpenRouter / requests — không gọi API thật,
không cần .env (đặt ADMIN_PASSWORD qua monkeypatch để TestClient chạy được).
"""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


# =========================================================================
# 1. db.py — 5 hàm source_documents (mock Supabase client)
# =========================================================================


class _FakeRes:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


def _fake_client() -> MagicMock:
    """Supabase client giả: mọi method trong chuỗi trả về chính client,
    kết thúc ở .execute() → fake.execute.return_value."""
    client = MagicMock()
    client.table.return_value = client
    for name in ("upsert", "select", "update", "delete", "eq", "in_", "order",
                 "limit", "like", "ilike", "gte"):
        getattr(client, name).return_value = client
    return client


def test_db_upsert_source_document() -> None:
    fake = _fake_client()
    fake.select.return_value.execute.return_value = _FakeRes([{"file_path": "nd-141.md", "status": "ready"}])
    with patch("db.get_client", return_value=fake):
        from db import upsert_source_document

        row = upsert_source_document(
            file_path="nd-141.md",
            title="NĐ 141/2026",
            doc_type="nd",
            effective_date="01/01/2026",
            source_origin="vault",
        )
    assert row["file_path"] == "nd-141.md"
    fake.table.assert_called_with("source_documents")
    upsert_kwargs = fake.upsert.call_args[1]
    assert upsert_kwargs.get("on_conflict") == "file_path"
    assert fake.select.called  # trả về row đã ghi
    # MEDIUM fix: updated_at phải là timestamp ISO, không phải literal 'now()'
    row_payload = fake.upsert.call_args[0][0]
    assert row_payload["updated_at"] != "now()"
    assert "T" in row_payload["updated_at"]  # ISO 8601 (vd 2026-08-02T12:00:00+00:00)


def test_db_upsert_source_document_invalid_doctype() -> None:
    from db import upsert_source_document

    with pytest.raises(ValueError, match="doc_type"):
        upsert_source_document(file_path="x.md", doc_type="khong-hop-le")


def test_db_get_all_source_documents() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([{"file_path": "a.md"}, {"file_path": "b.md"}])
    with patch("db.get_client", return_value=fake):
        from db import get_all_source_documents

        rows = get_all_source_documents()
    assert len(rows) == 2
    fake.order.assert_called_with("updated_at", desc=True)


def test_db_get_source_document_by_path_found() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([{"file_path": "tt-20.md", "status": "ready"}])
    with patch("db.get_client", return_value=fake):
        from db import get_source_document_by_path

        row = get_source_document_by_path("tt-20.md")
    assert row is not None and row["file_path"] == "tt-20.md"


def test_db_get_source_document_by_path_missing() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([])
    with patch("db.get_client", return_value=fake):
        from db import get_source_document_by_path

        assert get_source_document_by_path("khong-co.md") is None


def test_db_delete_source_document_found() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([{"file_path": "x.md"}], count=1)
    with patch("db.get_client", return_value=fake):
        from db import delete_source_document

        assert delete_source_document("x.md") is True


def test_db_delete_source_document_missing() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([], count=0)
    with patch("db.get_client", return_value=fake):
        from db import delete_source_document

        assert delete_source_document("khong-co.md") is False


def test_db_update_source_document_status() -> None:
    fake = _fake_client()
    fake.execute.return_value = _FakeRes([{"file_path": "x.md", "status": "processing"}])
    with patch("db.get_client", return_value=fake):
        from db import update_source_document_status

        row = update_source_document_status("x.md", "processing")
    assert row is not None and row["status"] == "processing"
    update_payload = fake.update.call_args[0][0]
    assert update_payload["status"] == "processing"
    # MEDIUM fix: updated_at là timestamp ISO, không phải literal 'now()'
    assert update_payload["updated_at"] != "now()"
    assert "T" in update_payload["updated_at"]


def test_db_update_source_document_status_invalid() -> None:
    from db import update_source_document_status

    with pytest.raises(ValueError, match="status"):
        update_source_document_status("x.md", "sai-status")


# =========================================================================
# 2. source_routes.py — 4 endpoint API (TestClient + mock db)
# =========================================================================


@pytest.fixture
def client(monkeypatch):
    """FastAPI TestClient với ADMIN_PASSWORD đặt sẵn + mock toàn bộ db.

    source_routes đọc ADMIN_PASSWORD 1 lần lúc import (module-level
    constant) — nếu test khác import trước (vd main.py trong
    test_knowledge_extractor), constant có thể là '' → patch trực tiếp
    thuộc tính module. Các endpoint gọi `from compliance_search_engine
    import rebuild_compliance_index` bên trong hàm → patch module gốc.
    """
    monkeypatch.setenv("ADMIN_PASSWORD", "test-password")
    import fastapi
    from fastapi.testclient import TestClient

    import compliance_search_engine
    import admin_auth
    import source_routes

    compliance_search_engine.rebuild_compliance_index = MagicMock(return_value=0)
    # check_admin đọc ADMIN_PASSWORD mỗi lần gọi qua admin_auth._get_admin_password
    # — env đã set ở trên là đủ (patch trực tiếp để chắc chắn)
    monkeypatch.setattr(admin_auth, "_get_admin_password", lambda: "test-password")

    app = fastapi.FastAPI()
    app.include_router(source_routes.router)
    return TestClient(app)


def _auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-password"}


def test_api_list_sources_requires_auth(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.get("/api/admin/sources")
    assert resp.status_code == 401


def test_api_auth_reads_password_per_call(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """HIGH fix: ADMIN_PASSWORD phải được đọc mỗi lần gọi (không bake lúc import).

    Trước đây _ADMIN_PASSWORD đọc 1 lần lúc import → server start khi chưa
    đặt password thì admin endpoint 401 tới khi restart. Giờ đổi env sau
    khi import → request mới phải xác thực OK ngay.
    """
    import admin_auth

    monkeypatch.setattr(admin_auth, "_get_admin_password", lambda: "password-doi-sau")
    with patch("source_routes.get_all_source_documents", return_value=[]), \
         patch("source_routes.get_client", return_value=_fake_client()):
        resp = client.get("/api/admin/sources", headers={"Authorization": "Bearer password-doi-sau"})
    assert resp.status_code == 200
    # Token cũ không còn hợp lệ (không bị cache password cũ)
    resp2 = client.get("/api/admin/sources", headers={"Authorization": "Bearer test-password"})
    assert resp2.status_code == 401


def test_api_list_sources_with_filters(client) -> None:  # type: ignore[no-untyped-def]
    fake = _fake_client()
    rows = [
        {"file_path": "luat-109-2025-tncn.md", "title": "Luật TNCN", "doc_type": "luat",
         "status": "ready", "source_origin": "vault", "effective_date": "01/01/2026"},
        {"file_path": "tt-20-2026-tndn.md", "title": "TT 20", "doc_type": "tt",
         "status": "ready", "source_origin": "vault", "effective_date": ""},
        {"file_path": "upload/huong-dan.md", "title": "HD upload", "doc_type": "other",
         "status": "ready", "source_origin": "upload", "effective_date": ""},
    ]
    # Đếm compliance_records (select .in_) → 2 cho luat-109, 1 cho tt-20
    fake.select.return_value.in_.return_value.execute.return_value = _FakeRes(
        [{"source_file": "luat-109-2025-tncn.md", "id": "r1"},
         {"source_file": "luat-109-2025-tncn.md", "id": "r2"},
         {"source_file": "tt-20-2026-tndn.md", "id": "r3"}]
    )
    with patch("source_routes.get_all_source_documents", return_value=rows), \
         patch("source_routes.get_client", return_value=fake):
        resp = client.get("/api/admin/sources", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    counts = {s["file_path"]: s["compliance_count"] for s in body["sources"]}
    assert counts["luat-109-2025-tncn.md"] == 2
    assert counts["tt-20-2026-tndn.md"] == 1
    assert counts["upload/huong-dan.md"] == 0


def test_api_list_sources_filter_search(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes.get_all_source_documents", return_value=[
        {"file_path": "a.md", "title": "Luật TNCN", "doc_type": "luat", "status": "ready",
         "source_origin": "vault", "effective_date": ""},
        {"file_path": "b.md", "title": "TT GTGT", "doc_type": "tt", "status": "ready",
         "source_origin": "vault", "effective_date": ""},
    ]), patch("source_routes.get_client", return_value=_fake_client()), \
         patch("source_routes._get_compliance_counts", return_value={}):
        resp = client.get("/api/admin/sources?doc_type=luat&search=tncn", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["sources"][0]["file_path"] == "a.md"


def test_api_add_source_upload_metadata_only(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes.upsert_source_document", return_value={"file_path": "upload/x.md", "status": "ready"}) as mock_upsert:
        resp = client.post(
            "/api/admin/sources",
            headers=_auth(),
            json={"file_path": "upload/x.md", "title": "HD", "doc_type": "other"},
        )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    mock_upsert.assert_called_once()
    assert mock_upsert.call_args[1]["source_origin"] == "upload"


def test_api_add_source_vault_missing_file_404(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes._resolve_vault_path", return_value=None):
        resp = client.post(
            "/api/admin/sources",
            headers=_auth(),
            json={"file_path": "luat-khong-ton-tai.md", "title": "x", "doc_type": "luat"},
        )
    assert resp.status_code == 404


def test_api_add_source_vault_extracts(client) -> None:  # type: ignore[no-untyped-def]
    fake = _fake_client()
    with patch("source_routes._resolve_vault_path", return_value="C:/vault/luat-109.md"), \
         patch("source_routes._do_extract_vault_file", return_value={
             "file_path": "luat-109.md", "records": 3, "uploaded": 3,
             "source": {"file_path": "luat-109.md", "status": "ready"},
         }) as mock_extract, \
         patch("source_routes.get_client", return_value=fake), \
         patch("compliance_search_engine.rebuild_compliance_index"):
        resp = client.post(
            "/api/admin/sources",
            headers=_auth(),
            json={"file_path": "luat-109.md", "title": "Luật TNCN", "doc_type": "luat"},
        )
    assert resp.status_code == 200
    assert resp.json()["records"] == 3
    mock_extract.assert_called_once()


def test_api_add_source_invalid_doctype_422(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/admin/sources",
        headers=_auth(),
        json={"file_path": "x.md", "title": "x", "doc_type": "luattt"},
    )
    assert resp.status_code == 422


def test_api_delete_source(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes.delete_compliance_records_by_source") as mock_del_records, \
         patch("source_routes.delete_source_document", return_value=True) as mock_del, \
         patch("compliance_search_engine.rebuild_compliance_index") as mock_rebuild:
        resp = client.delete("/api/admin/sources?file_path=nd-141.md", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True
    mock_del_records.assert_called_once_with("nd-141.md")
    mock_del.assert_called_once_with("nd-141.md")
    mock_rebuild.assert_called_once()


def test_api_delete_source_not_found_404(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes.delete_source_document", return_value=False):
        resp = client.delete("/api/admin/sources?file_path=khong-co.md", headers=_auth())
    assert resp.status_code == 404


def test_api_delete_source_requires_file_path(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.delete("/api/admin/sources", headers=_auth())
    assert resp.status_code == 400


def test_api_re_extract_success(client) -> None:  # type: ignore[no-untyped-def]
    existing = {"file_path": "luat-109.md", "doc_type": "luat", "title": "Luật TNCN", "effective_date": "01/01/2026"}
    with patch("source_routes._resolve_vault_path", return_value="C:/vault/luat-109.md"), \
         patch("source_routes.get_source_document_by_path", return_value=existing), \
         patch("source_routes._do_extract_vault_file", return_value={
             "file_path": "luat-109.md", "records": 5, "uploaded": 5,
             "source": {"file_path": "luat-109.md", "status": "ready"},
         }) as mock_extract, \
         patch("compliance_search_engine.rebuild_compliance_index") as mock_rebuild:
        resp = client.post("/api/admin/sources/re-extract", headers=_auth(),
                           json={"file_path": "luat-109.md"})
    assert resp.status_code == 200
    assert resp.json()["records"] == 5
    # Xoá records cũ giờ nằm trong _do_extract_vault_file (không gọi 2 lần)
    mock_extract.assert_called_once()
    mock_rebuild.assert_called_once()


def test_api_re_extract_upload_source_400(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.post("/api/admin/sources/re-extract", headers=_auth(),
                       json={"file_path": "upload/x.md"})
    assert resp.status_code == 400


def test_api_re_extract_missing_file_404(client) -> None:  # type: ignore[no-untyped-def]
    with patch("source_routes._resolve_vault_path", return_value=None):
        resp = client.post("/api/admin/sources/re-extract", headers=_auth(),
                           json={"file_path": "luat-khong-co.md"})
    assert resp.status_code == 404


def test_api_re_extract_requires_auth(client) -> None:  # type: ignore[no-untyped-def]
    resp = client.post("/api/admin/sources/re-extract", json={"file_path": "x.md"})
    assert resp.status_code == 401


def test_api_do_extract_sets_error_status_on_failure(client) -> None:  # type: ignore[no-untyped-def]
    """Lỗi extract → status=error (không crash), HTTP 500."""
    from source_routes import _do_extract_vault_file

    with patch("source_routes.update_source_document_status") as mock_status, \
         patch("source_routes.delete_compliance_records_by_source") as mock_del, \
         patch("knowledge_extractor.extract_from_file", side_effect=RuntimeError("LLM hết tiền")):
        with pytest.raises(Exception) as exc_info:
            _do_extract_vault_file("x.md", "/vault/x.md", "nd", "X", "")
    assert "Extract x.md thất bại" in str(exc_info.value)
    mock_status.assert_any_call("x.md", "processing")
    mock_status.assert_any_call("x.md", "error")
    # Xoá records cũ vẫn được gọi trước extract (không mất dù extract fail)
    mock_del.assert_called_once_with("x.md")


def test_api_do_extract_deletes_old_records_before_upsert(client) -> None:  # type: ignore[no-untyped-def]
    """HIGH fix: _do_extract_vault_file phải xoá records cũ TRƯỚC khi upsert —
    sync cùng nguồn 2 lần không để bản ghi hết hiệu lực (regulation đổi)."""
    from source_routes import _do_extract_vault_file

    records = [{"source_file": "x.md", "regulation": "quy định mới"}]
    with patch("source_routes.update_source_document_status") as mock_status, \
         patch("source_routes.delete_compliance_records_by_source") as mock_del, \
         patch("knowledge_extractor.extract_from_file", return_value=records), \
         patch("source_routes.upsert_compliance_records", return_value=1) as mock_upsert, \
         patch("source_routes.upsert_source_document", return_value={"file_path": "x.md", "status": "ready"}) as mock_source:
        result = _do_extract_vault_file("x.md", "/vault/x.md", "nd", "X", "")
    assert result["records"] == 1
    # Thứ tự: xoá cũ → extract → upsert mới
    mock_del.assert_called_once_with("x.md")
    mock_upsert.assert_called_once()
    mock_status.assert_called_once_with("x.md", "processing")
    # status=ready đi qua upsert_source_document (không phải update status)
    assert mock_source.call_args[1]["status"] == "ready"


# =========================================================================
# 3. upload_routes.py — luồng upload có auto-extract
# =========================================================================


@pytest.fixture
def upload_client(monkeypatch):
    """TestClient cho router upload — mock toàn bộ db + extractor + rebuild."""
    monkeypatch.setenv("ADMIN_PASSWORD", "test-password")
    import fastapi
    from fastapi.testclient import TestClient

    import upload_routes

    import admin_auth

    monkeypatch.setattr(admin_auth, "_get_admin_password", lambda: "test-password")

    app = fastapi.FastAPI()
    app.include_router(upload_routes.router)
    return TestClient(app)


def test_upload_auto_extracts_compliance_and_upserts_source(upload_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Upload .txt → chunks lưu + auto-extract records + source_documents ready."""
    records = [{"source_file": "upload/giai-thich.md", "topic": "t", "regulation": "ngưỡng 01 tỷ đồng"}]

    with patch("upload_routes.get_client") as mock_client, \
         patch("upload_routes.upsert_document"), \
         patch("upload_routes.rebuild") as mock_rebuild, \
         patch("upload_routes.upsert_compliance_records", return_value=1) as mock_upsert_records, \
         patch("upload_routes.delete_compliance_records_by_source") as mock_del_records, \
         patch("upload_routes.upsert_source_document") as mock_upsert_source, \
         patch("knowledge_extractor.extract_from_text", return_value=records) as mock_extract:
        resp = upload_client.post(
            "/api/admin/upload",
            headers={"Authorization": "Bearer test-password"},
            files={"file": ("giai-thich.txt", "Ngưỡng doanh thu 01 tỷ đồng/năm.", "text/plain")},
        )

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    mock_extract.assert_called_once()
    mock_upsert_records.assert_called_once()
    mock_del_records.assert_called_once()
    mock_upsert_source.assert_called_once()
    assert mock_upsert_source.call_args[1]["source_origin"] == "upload"
    assert mock_rebuild.called  # BM25 documents rebuild vẫn chạy


def test_upload_extract_failure_does_not_fail_upload(upload_client) -> None:  # type: ignore[no-untyped-def]
    """Lỗi auto-extract (LLM) → upload vẫn 200, chunks vẫn lưu."""
    with patch("upload_routes.get_client") as mock_client, \
         patch("upload_routes.upsert_document"), \
         patch("upload_routes.rebuild"), \
         patch("knowledge_extractor.extract_from_text", side_effect=RuntimeError("LLM down")), \
         patch("upload_routes.upsert_compliance_records", side_effect=AssertionError("không được gọi")):
        resp = upload_client.post(
            "/api/admin/upload",
            headers={"Authorization": "Bearer test-password"},
            files={"file": ("nd-x.txt", "Nội dung không quan trọng 90 ngày.", "text/plain")},
        )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_upload_rejects_unknown_extension(upload_client) -> None:  # type: ignore[no-untyped-def]
    resp = upload_client.post(
        "/api/admin/upload",
        headers={"Authorization": "Bearer test-password"},
        files={"file": ("x.exe", b"abc", "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_upload_requires_auth(upload_client) -> None:  # type: ignore[no-untyped-def]
    resp = upload_client.post(
        "/api/admin/upload",
        files={"file": ("x.txt", "noi dung".encode("utf-8"), "text/plain")},
    )
    assert resp.status_code == 401


# =========================================================================
# 4. sync_44_sources.py — helper + luồng sync (mock requests)
# =========================================================================

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "DataTest"))

from sync_44_sources import (  # noqa: E402
    build_payload,
    classify_doctype,
    extract_title,
    parse_effective_date,
    scan_vault_files,
    sync_all,
)


def test_sync_classify_doctype() -> None:
    assert classify_doctype("luat-109-2025-tncn.md") == "luat"
    assert classify_doctype("nd-141-2026-ho-kinh-doanh-tndn.md") == "nd"
    assert classify_doctype("tt-20-2026-tndn.md") == "tt"
    assert classify_doctype("nq-198-2025-kinh-te-tu-nhan.md") == "nq"
    assert classify_doctype("vbhn-luat-doanh-nghiep-2025.md") == "vbhn"
    assert classify_doctype("bo-luat-dan-su-2015.md") == "other"
    assert classify_doctype("glossary.md") == "other"


def test_sync_parse_effective_date_from_frontmatter() -> None:
    content = '---\ntitle: NĐ 141/2026\neffective_date: "01/01/2026"\n---\nNội dung.'
    assert parse_effective_date(content) == "01/01/2026"


def test_sync_parse_effective_date_from_body() -> None:
    content = (
        "# NĐ 141/2026\n"
        "Có hiệu lực từ ngày 15/2/2026.\n"
    )
    assert parse_effective_date(content) == "15/02/2026"


def test_sync_parse_effective_date_empty() -> None:
    assert parse_effective_date("Không có ngày nào.") == ""


def test_sync_extract_title() -> None:
    assert extract_title("nd-141.md", '---\ntitle: NĐ 141/2026 — Sửa đổi thuế hộ KD\n---\nx') == "NĐ 141/2026 — Sửa đổi thuế hộ KD"
    assert extract_title("nd-141.md", "không frontmatter") == "nd-141"


def test_sync_scan_vault_files(tmp_path) -> None:  # type: ignore[no-untyped-def]
    vault = tmp_path
    (vault / "luat-109-2025-tncn.md").write_text("x", encoding="utf-8")
    (vault / "nd-141-2026.md").write_text("x", encoding="utf-8")
    (vault / "tt-20-2026.md").write_text("x", encoding="utf-8")
    (vault / "_index.md").write_text("x", encoding="utf-8")
    (vault / "_template.md").write_text("x", encoding="utf-8")
    (vault / "glossary.md").write_text("x", encoding="utf-8")
    (vault / "bo-luat-dan-su-2015.md").write_text("x", encoding="utf-8")  # không prefix → bỏ
    sub = vault / "chung"
    sub.mkdir()
    (sub / "nd-phu-luc.md").write_text("x", encoding="utf-8")  # thư mục con → bỏ

    files = scan_vault_files(str(vault))
    names = [Path(f).name for f in files]
    assert names == ["luat-109-2025-tncn.md", "nd-141-2026.md", "tt-20-2026.md"]


def test_sync_build_payload(tmp_path) -> None:  # type: ignore[no-untyped-def]
    md = tmp_path / "nd-141-2026.md"
    md.write_text('---\ntitle: NĐ 141/2026\neffective_date: "01/01/2026"\n---\nNội dung.', encoding="utf-8")
    payload = build_payload(str(md))
    assert payload == {
        "file_path": "nd-141-2026.md",
        "title": "NĐ 141/2026",
        "doc_type": "nd",
        "effective_date": "01/01/2026",
    }


def test_sync_all_dry_run(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "luat-109.md").write_text("x", encoding="utf-8")
    (tmp_path / "nd-141.md").write_text("x", encoding="utf-8")
    report = sync_all(base_url="http://localhost:8000", admin_password="", vault_dir=str(tmp_path), dry_run=True)
    assert report["total"] == 2
    assert report["success"] == 0
    assert len(report["results"]) == 2
    assert all(r["dry_run"] for r in report["results"])


def test_sync_all_posts_each_source(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "luat-109.md").write_text("x", encoding="utf-8")
    (tmp_path / "nd-141.md").write_text("x", encoding="utf-8")

    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.json.return_value = {"ok": True, "records": 3}

    with patch("sync_44_sources.requests.post", return_value=fake_resp) as mock_post:
        report = sync_all(
            base_url="http://localhost:8000",
            admin_password="pw",
            vault_dir=str(tmp_path),
        )
    assert report["success"] == 2
    assert report["total"] == 2
    assert mock_post.call_count == 2
    url = mock_post.call_args[0][0]
    assert url == "http://localhost:8000/api/admin/sources"
    headers = mock_post.call_args[1]["headers"]
    assert headers["Authorization"] == "Bearer pw"


def test_sync_all_retries_then_fails(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "nd-141.md").write_text("x", encoding="utf-8")

    bad = MagicMock()
    bad.status_code = 500
    bad.text = "internal error"

    with patch("sync_44_sources.requests.post", return_value=bad) as mock_post, \
         patch("sync_44_sources.time.sleep"):  # không chờ thật
        report = sync_all(base_url="http://localhost:8000", admin_password="pw", vault_dir=str(tmp_path))
    assert report["success"] == 0
    assert len(report["failed"]) == 1
    # RETRY_ATTEMPTS=2 → 3 lần gọi
    assert mock_post.call_count == 3


def test_sync_all_skip_http_422_no_retry(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "tt-20.md").write_text("x", encoding="utf-8")

    bad = MagicMock()
    bad.status_code = 422
    bad.text = "doc_type sai"

    with patch("sync_44_sources.requests.post", return_value=bad) as mock_post, \
         patch("sync_44_sources.time.sleep"):
        report = sync_all(base_url="http://localhost:8000", admin_password="pw", vault_dir=str(tmp_path))
    assert report["success"] == 0
    assert len(report["failed"]) == 1
    # 422 là lỗi nghiệp vụ — post_source không được retry (tối đa 3 lần)
    assert mock_post.call_count < 3
