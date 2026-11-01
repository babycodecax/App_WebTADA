# -*- coding: utf-8 -*-
"""Audits chi tiet anchor trong blog: moi href domain count + text chua so-hieu."""
import json, os, re, sys
import collections
import urllib.parse

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

A_RE = re.compile(r'<a\s[^>]*href="([^" ]+)"([^>]*)>([\s\S]{0,300}?)</a>', re.I)
ST_RE = re.compile(r"\b(\d{1,4}/\d{4}/[A-Za-zÀ-ỹĐ0-9\-]+)")
doms = collections.Counter()
textnum_anchor = 0
samples_tn = []
for r in rows:
    c = r.get("content") or ""
    for m in A_RE.finditer(c):
        href, attrs, text = m.group(1), m.group(2), re.sub("<[^>]+>", " ", m.group(3)).strip()
        if href.startswith("/"):
            kind = "internal"
        else:
            kind = urllib.parse.urlparse(href).netloc or href[:30]
            kind = "relative-raw:" + kind
        doms[kind] += 1
        if ST_RE.search(text):
            textnum_anchor += 1
            if len(samples_tn) < 10:
                samples_tn.append((r["slug"][:45], href[:100], text[:80]))

print("== TAT CA KINDS href ==")
for d, n in doms.most_common(20):
    print(n, d)
print("\nanchors text co so-hieu:", textnum_anchor)
for s in samples_tn:
    print(" slug:", s[0], "| href:", s[1], "| text:", s[2])
