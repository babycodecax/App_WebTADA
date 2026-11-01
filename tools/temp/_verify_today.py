# -*- coding: utf-8 -*-
"""Verify bai moi hom nay: REST title/summary == draft + live marker + published_posts.json."""
import io, json, os, re, sys, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _blog_common import read_env, get_row, SITE  # noqa: E402

SLUG = "tin-don-sai-han-nop-thue-quy-3-2026"
DRAFT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blog-content", "cluster6-tin-tuc", SLUG + ".md")


def fm_field(fm, name):
    m = re.search(r'^%s:\s*"(.*)"\s*$' % re.escape(name), fm, re.M)
    return m.group(1).strip() if m else ""


def fetch(url):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace"), r.status


def main():
    env = read_env()
    text = io.open(DRAFT, encoding="utf-8").read()
    fm = text.split("---")[1]
    d_title, d_summary = fm_field(fm, "title"), fm_field(fm, "summary")
    row = get_row(env, "blog_posts", SLUG) or {}
    r_title, r_summary, r_status = (row.get("title") or "").strip(), (row.get("summary") or "").strip(), row.get("status")
    html, st = fetch(SITE + "/blog/" + SLUG)
    marker = "Câu 1: Nộp tờ khai trên eTax Mobile"
    live_ok = st == 200 and marker in html
    pp = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "published_posts.json"), encoding="utf-8"))
    in_pp = any(p.get("slug") == SLUG for p in pp)
    print("DRAFT title :", d_title)
    print("REST  title :", r_title)
    print("REST status :", r_status, "| published_at:", (row.get("published_at") or "")[:19])
    print("len summary :", len(r_summary))
    print("REST khop   :", "OK" if (r_status == "published" and r_title == d_title and r_summary == d_summary) else "SAI")
    print("LIVE status :", st, "| marker FAQ:", "CO" if live_ok else "KHONG")
    print("published_posts.json co slug:", "CO" if in_pp else "KHONG")
    print("KET QUA:", "TOK" if (r_status == "published" and r_title == d_title and r_summary == d_summary and live_ok and in_pp) else "LOI")


if __name__ == "__main__":
    main()
