# -*- coding: utf-8 -*-
"""Quet DB blog published: moi image path duoc tham chiếu trong content → so SANH với live prod."""
import json, os, re, sys, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from _blog_common import read_env  # noqa: E402

PAT = re.compile(r'((?:https://ketoanthuetada\.com)?/(?:img|images|uploads|user-photos|api/public)[A-Za-z0-9_\-./]+?)["\'\)\s]')


def main():
    env = read_env()
    base = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base.endswith("/rest/v1"):
        base += "/rest/v1"
    url = base + "/blog_posts?select=slug,content&status=eq.published"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
    rows = json.load(urllib.request.urlopen(req, timeout=180))
    print("rows:", len(rows))
    refs = {}
    for r in rows:
        for m in PAT.finditer(r.get("content") or ""):
            refs.setdefault(m.group(1), []).append(r["slug"])
    print("unique refs:", len(refs))
    for u in sorted(refs):
        print(len(refs[u]), u)
    # HEAD tung ref tren prod
    uniq = sorted(refs)
    print("\n=== HEAD LIVE ===")
    bad = []
    for u in uniq:
        full = u if u.startswith("http") else "https://ketoanthuetada.com" + u
        try:
            req2 = urllib.request.Request(full, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2, timeout=30) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:  # noqa: BLE001
            code = repr(e)[:30]
        ok = code == 200
        if not ok:
            bad.append(u)
            print(("LỖI %s" % code), u)
    print("\nTONG LOI:", len(bad))
    for u in bad:
        print(" -", u, "| dung trong:", ", ".join(refs[u][:6]))


if __name__ == "__main__":
    main()
