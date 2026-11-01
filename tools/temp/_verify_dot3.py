# -*- coding: utf-8 -*-
"""Verify dot 3 (4 bai guide): REST title/summary == draft + live marker (Cau 1 FAQ)."""
import io, os, re, sys, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _blog_common import read_env, get_row, SITE  # noqa: E402

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blog-content", "cluster7-dich-vu")
SLUGS = [
    "cach-dang-ky-hoa-don-dien-tu-tren-etax-cho-hkd",
    "huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026",
    "quyet-toan-thue-tncn-2026-huong-dan-chi-tiet",
    "ke-khai-thue-tncn-tren-etax-mobile-huong-dan-a-z",
]


def fm_field(fm, name):
    m = re.search(r'^%s:\s*"(.*)"\s*$' % re.escape(name), fm, re.M)
    return m.group(1).strip() if m else ""


def live_marker_from_draft(path):
    try:
        t = io.open(path, encoding="utf-8").read()
    except OSError:
        return ""
    for line in t.splitlines():
        m = re.match(r"\*\*C(?:âu|au) 1:\s*(.+?)\*\*\s*$", line.strip())
        if m:
            return "Câu 1: " + m.group(1).strip()
    return ""


def fetch_live(url):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace"), r.status


def main():
    env = read_env()
    n_ok = n_bad = 0
    for slug in SLUGS:
        path = os.path.join(BASE, slug + ".md")
        text = io.open(path, encoding="utf-8").read()
        fm = text.split("\n---")[0].replace("---\n", "", 1) if text.startswith("---") else ""
        fm = text.split("---")[1]
        d_title = fm_field(fm, "title")
        d_summary = fm_field(fm, "summary")
        row = get_row(env, "blog_posts", slug) or {}
        r_title = (row.get("title") or "").strip()
        r_summary = (row.get("summary") or "").strip()
        r_status = row.get("status")
        rest_ok = r_status == "published" and r_title == d_title and r_summary == d_summary
        marker = live_marker_from_draft(path)
        try:
            html, st = fetch_live(SITE + "/blog/" + slug)
        except Exception as e:  # noqa: BLE001
            html, st = "", 0
            print("LIVE LOI", slug, repr(e))
        live_ok = st == 200 and bool(marker) and marker in html
        ok = rest_ok and live_ok
        n_ok += 1 if ok else 0
        n_bad += 0 if ok else 1
        print("%s | REST(title,summary)= %s | len(sum)=%d | pub=%s | live=%s marker=%s | %s"
              % (slug[:55], "OK" if rest_ok else "SAI", len(r_summary),
                 (row.get("published_at") or "")[:10], st,
                 "CO" if live_ok else ("KHONG (%r)" % marker[:50]),
                 "TOK" if ok else "LOI"))
    print("TONG: %d OK, %d LOI" % (n_ok, n_bad))


if __name__ == "__main__":
    main()
