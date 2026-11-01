# -*- coding: utf-8 -*-
"""Quet DB blog published: ton Anchor 'can cu phap ly' tro ra ngoai (thuvienphapluat,
luatvietnam, gov...) + mau so-hieu trong text = de thiet ke rewrite link noi bo."""
import json, os, re, sys
import urllib.request
import collections

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _blog_common import read_env  # noqa: E402

env = read_env()
base = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
if not base.endswith("/rest/v1"):
    base += "/rest/v1"

url = base + "/blog_posts?select=slug,status,content&status=eq.published"
req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
rows = json.load(urllib.request.urlopen(req, timeout=180))
print("posts:", len(rows))

A_RE = re.compile(r'<a\s[^>]*href="([^"{ }]+)"[^>]*>([\s\S]{0,200}?)</a>', re.I)
doms = collections.Counter()
samples = []
num_pt = re.compile(r"\d{1,4}/\d{4}/[A-Za-zÀ-ỹĐ0-9\-]+")
ext_pt = re.compile(r"thuvienphapluat|luatvietnam|luat\.gov|vanban\.gov|congbao|lawnet|hethongphapluat|vnlp|lexit| sửa ", re.I)
for r in rows:
    c = r.get("content") or ""
    for m in A_RE.finditer(c):
        href, text = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2)).strip()
        if href.startswith(("http://", "https://")) and ext_pt.search(href + " " + text):
            d = urllib.parse.urlparse(href).netloc if href.find("http") == 0 else "?"
            doms[d] += 1
            if len(samples) < 12:
                samples.append((r["slug"][:50], href[:110], text[:90]))
    # mot mau so-hieu doc no co tru?  (plain text cac kieu lai)
# so hieu trong toan content (khong phai link)
cnt = collections.Counter()
for r in rows:
    for m in num_pt.finditer(r.get("content") or ""):
        cnt[m.group(0)] += 1
print("\n== EXTERNAL LEGAL DOMAINS ==")
for d, n in doms.most_common(12):
    print(n, d)
print("\n== SAMPLES ==")
for s in samples:
    print(" slug:", s[0])
    print("   href:", s[1])
    print("   text:", s[2])
print("\n== TOP DOC NUMBERS TRONG PLAIN TEXT ==")
for k, n in cnt.most_common(15):
    print(n, k)
