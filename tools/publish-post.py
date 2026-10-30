# -*- coding: utf-8 -*-
"""Publish draft blog bang 1 lenh. Khong phu thuoc thu muc chay.

Cach dung:
  python tools/publish-post.py --draft <file.md> [tuy chon]
    --no-preflight             bo qua preflight-post.py (mac dinh cham truoc khi ghi DB)
    --force                    bo qua cong duyet noi dung (review_status khac approved)
    --overwrite                cho phep ghi de bai DA PUBLISHED (backup JSON tu dong, giu published_at)
    --dry-run                  khong ghi DB/index, chi in hanh dong du kien
    --no-index                 khong gui IndexNow + Bing
    --backfill                 chay backfill knowledge_chunks sau khi publish
    --allow-slug-mismatch      cho phep slug frontmatter khac ten file (mac dinh chen)

Hanh vi an toan:
  - Bai da PUBLISHED roi: khong ghi DB (idempotent), chi verify + KB + index. Ghi de phai --overwrite.
  - Ghi de: backup row cu vao tools/.publish-backup/<slug>-<ts>.json truoc khi PATCH; PATCH theo id;
    GIU published_at cu.
  - Cong duyet: status=published can review_status=approved trong frontmatter, khong thi --force.
  - Audit log: tools/publish-log.jsonl (append, dang mot dong json cho moi insert/patch).
Exit: 0 thanh cong; 1 co LOI; 2 sai tham so.
"""
import argparse
import datetime
import io
import json
import os
import re
import subprocess
import sys

from _blog_common import (SLUG_RE, PROJECT_DIR, SITE, TOOLS_DIR, bing_submit, field,
                          frontmatter, get_row, indexnow_submit, insert_row,
                          knowledge_chunks_exist, out, patch_row, published_at_iso,
                          read_env, redact)


def fail(msg):
    print("FAIL: " + str(msg), file=sys.stderr, flush=True)
    return 1


def run_preflight(path):
    cmd = [sys.executable, os.path.join(TOOLS_DIR, "preflight-post.py"), path]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=600)
    except (subprocess.TimeoutExpired, OSError) as e:
        return 1, "[ERR] preflight khong chay duoc: " + redact(str(e))
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def backup_row(existing, slug):
    d = os.path.join(TOOLS_DIR, ".publish-backup")
    os.makedirs(d, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    p = os.path.join(d, "%s-%s.json" % (slug, ts))
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(existing, ensure_ascii=False))
    out("backup row cu: " + p)


def run_backfill(env):
    api_dir = os.path.join(PROJECT_DIR, "api")
    script = os.path.join(api_dir, "scripts", "backfill-blog-knowledge.mjs")
    if not os.path.exists(script):
        return 2, "thieu api/scripts/backfill-blog-knowledge.mjs"
    e = dict(os.environ)
    e.update(env)  # .env thang bien shell tranh khac loat doc
    node = env.get("NODE_BIN", "node")
    try:
        p = subprocess.run([node, "--import", "tsx", script], cwd=api_dir, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=900, env=e)
    except (subprocess.TimeoutExpired, OSError) as e2:
        return 1, "[ERR] backfill khong chay duoc: " + redact(str(e2))
    return p.returncode, redact((p.stdout or "") + (p.stderr or ""))


def audit(action, **fields):
    path = os.path.join(TOOLS_DIR, "publish-log.jsonl")
    rec = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "action": action}
    rec.update(fields)
    try:
        with io.open(path, "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError as e:
        out("(KHONG GHI DUOC audit log: %s)" % redact(str(e)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", required=True)
    ap.add_argument("--force", action="store_true", help="bo qua cong duyet noi dung; cho phep ha published -> draft khi di cung --overwrite")
    ap.add_argument("--overwrite", action="store_true", help="cho phep ghi de bai da published")
    ap.add_argument("--dry-run", action="store_true", help="khong ghi DB, khong gui index")
    ap.add_argument("--no-preflight", action="store_true")
    ap.add_argument("--no-index", action="store_true")
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--allow-slug-mismatch", action="store_true")
    args = ap.parse_args()

    path = args.draft
    if not os.path.isfile(path):
        return fail("khong tim thay draft %s" % path)

    with io.open(path, "r", encoding="utf-8-sig", newline="") as f:
        text = f.read()
    fm, body = frontmatter(text)

    # Tang 1: preflight (checker format + rac + link + ngay trong tuan)
    if not args.no_preflight:
        rc, s = run_preflight(path)
        print(s, end="")
        if rc != 0:
            return fail("preflight that bai (rc=%d), khong ghi DB" % rc)

    # Tang 2: frontmatter + cong duyet
    slug = field(fm, "slug").strip()
    title = field(fm, "title").strip()
    summary = field(fm, "summary").strip()
    status = (field(fm, "status") or "draft").strip().lower()
    review_status = (field(fm, "review_status") or "").strip().lower()

    if not slug:
        return fail("thieu slug trong frontmatter")
    if not SLUG_RE.fullmatch(slug):
        return fail("slug khong hop le: %r" % slug)
    stem = os.path.splitext(os.path.basename(path))[0]
    if slug != stem and not args.allow_slug_mismatch:
        return fail("slug (%s) khac ten file (%s) - co the copy nham draft; "
                    "dung --allow-slug-mismatch neu chac chan" % (slug, stem))
    if not title:
        return fail("thieu title")
    if not summary:
        return fail("thieu summary")
    if status not in ("published", "draft"):
        return fail("status khong hop le: %r (chi published hoac draft)" % status)
    approved = review_status == "approved"
    if status == "published" and not approved and not args.force:
        return fail("chua duoc duyet: review_status=%r; them 'review_status: \"approved\"' "
                    "vao frontmatter sau khi duyet, hoac --force" % (review_status or "<trong>"))
    out("duyet: status=%s review_status=%s ok=%s" % (status, review_status or "<trong>",
                                                     "co" if (approved or args.force) else "bo qua"))

    pb_front = published_at_iso(fm)
    raw_pb = field(fm, "published_at").strip()
    if pb_front is None and raw_pb and raw_pb.lower() not in ("null", "none", "na"):
        out("(CANH BAO: published_at trong frontmatter khong dung ISO-8601 (%r) -> bo qua)" % raw_pb)
    payload = {"title": title, "slug": slug, "summary": summary, "content": body.strip(),
               "status": status}

    if args.dry_run:
        out("DRY RUN: slug=%s status=%s review_status=%s content=%d ky tu "
            "(%s)" % (slug, status, review_status or "<trong>", len(body),
                      "s dung published_at tu frontmatter: " + pb_front if pb_front else "published_at: now UTC khi INSERT"))
        out("DRY RUN: khong ghi DB, khong gui index. Bo --dry-run de thuc chay.")
        return 0

    env = read_env()
    if not env:
        return fail("khong doc duoc api/.env")

    existing = get_row(env, "blog_posts", slug)
    action = "insert"
    if existing:
        if (existing.get("status") or "").lower() == "published" and not args.overwrite:
            action = "skip"
            out("DA TON TAI published (id=%s, published_at=%s) -> khong ghi DB; "
                "dung --overwrite de ghi de (backup tu dong)" % (existing.get("id"), existing.get("published_at")))
        else:
            if (existing.get("status") or "").lower() == "published" and status == "draft" and not args.force:
                return fail("ghi de bai published bang draft (ha status) — neu chac chan dung --force")
            action = "patch"
            backup_row(existing, slug)

    if action == "insert":
        body_insert = dict(payload)
        body_insert["published_at"] = pb_front or datetime.datetime.now(
            datetime.timezone.utc).isoformat(timespec="microseconds")
        row = insert_row(env, "blog_posts", body_insert)
        out("INSERT OK: id=%s published_at=%s" % (row["id"], row.get("published_at")))
        audit("insert", slug=slug, id=row["id"], force=args.force)
    elif action == "patch":
        row = patch_row(env, "blog_posts", existing["id"], payload)
        out("PATCH OK: id=%s (giu published_at=%s)" % (row["id"], row.get("published_at")))
        audit("patch", slug=slug, id=row["id"], overwrite=args.overwrite, force=args.force)
    else:
        row = existing

    # Verify
    row2 = get_row(env, "blog_posts", slug) if action != "skip" else row
    if not row2:
        raise RuntimeError("khong lay duoc row sau khi ghi (slug " + slug + ")")
    out("VERIFY REST: status=%s published_at=%s" % (row2.get("status"), row2.get("published_at")))

    # Knowledge base cho chatbot
    if knowledge_chunks_exist(env, "blog/" + row2["id"]):
        out("KB: da co knowledge_chunks (file_path=blog/%s)" % row2["id"])
    else:
        out("CANH BAO: bai chua co trong knowledge_chunks (chatbox chua biet bai nay)")
        out("           chay: python tools/publish-post.py --draft <file> --backfill; hoac:")
        out("           node --import tsx api/scripts/backfill-blog-knowledge.mjs (cwd api)")

    if args.backfill:
        rc, s = run_backfill(env)
        if s.strip():
            print(s, end="")
        if rc != 0:
            return fail("backfill knowledge LOI (rc=%d)" % rc)
        out("BACKFILL OK")

    if not args.no_index:
        st = indexnow_submit(slug=slug)
        out("INDEXNOW: %s" % st)
        brc, btxt = bing_submit(slug)
        out("BING (rc=%d): %s" % (brc, btxt))
        if brc != 0:
            return fail("bing-submit loi (da publish, chay lai index bang lenh rieng)")

    out("== PUBLISH OK ==")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print("[ERR] " + redact(str(e)), file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print("[ERR] " + redact(str(e)), file=sys.stderr, flush=True)
        sys.exit(1)
