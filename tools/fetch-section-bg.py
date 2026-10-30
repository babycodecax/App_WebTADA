# -*- coding: utf-8 -*-
"""fetch-section-bg.py — Tai anh nen Pexels huong landscape cho section landing.

Dung chung PEXELS_API_KEY trong backend/.env (giong make-post-image.py).

VIE:
  python tools/fetch-section-bg.py candidates "<query>"          # tai 4 anh dau ve tmp de xem
  python tools/fetch-section-bg.py save "<query>" <idx> <slug>   # chon anh idx -> webp -> 3 nhanh img/

Xuat:
  candidates: tools/blog-content/social-images/.bgpick/<n>.jpg (240px preview + file digits.txt ghi link goc)
  save: img/<slug>.webp + api/public/img/<slug>.webp + backend/static/img/<slug>.webp (1600w, q82)
"""
import io
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "tools", "blog-content", "social-images", ".bgpick")


def ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def env_key():
    p = os.path.join(ROOT, "backend", ".env")
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("PEXELS_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("ERROR: thieu PEXELS_API_KEY trong backend/.env")


def search(query, per_page=4):
    q = urllib.parse.quote(query)
    req = urllib.request.Request(
        "https://api.pexels.com/v1/search?query=%s&per_page=%d&orientation=landscape" % (q, per_page),
        headers={"Authorization": env_key(), "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx()) as r:
        return r.read()


def cmd_candidates(query):
    data = search(query, 4)
    photos = data.get("photos", [])
    if not photos:
        raise SystemExit("Khong tim thay anh nao cho query: " + query)
    os.makedirs(OUTDIR, exist_ok=True)
    lines = []
    for i, p in enumerate(photos):
        raw = download(p["src"].get("landscape") or p["src"].get("large"))
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((480, 480))
        im.save(os.path.join(OUTDIR, "%d.jpg" % i), quality=80)
        lines.append("%d %s %dx%d alt=%s" % (i, p["photographer"], p["width"], p["height"],
                                             (p.get("alt") or "")[:80]))
        lines.append("  full: %s" % (p["src"].get("landscape2x") or p["src"].get("landscape")))
    with open(os.path.join(OUTDIR, "info.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))


def cmd_save(query, idx, slug, width=1600, quality=82):
    data = search(query, max(idx + 1, 4))
    photos = data.get("photos", [])
    if len(photos) <= idx:
        raise SystemExit("Chi co %d anh, khong lay duoc idx %d" % (len(photos), idx))
    p = photos[idx]
    raw = download(p["src"].get("landscape2x") or p["src"].get("large2x")
                   or p["src"].get("landscape") or p["src"].get("large"))
    from PIL import Image
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if im.width > width:
        im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality)
    webp = buf.getvalue()
    targets = [
        os.path.join(ROOT, "img", slug + ".webp"),
        os.path.join(ROOT, "api", "public", "img", slug + ".webp"),
        os.path.join(ROOT, "backend", "static", "img", slug + ".webp"),
    ]
    for t in targets:
        with open(t, "wb") as f:
            f.write(webp)
        print("OK", t, len(webp), "bytes", im.size, "| by", p["photographer"])


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == "candidates":
        cmd_candidates(sys.argv[2])
    elif cmd == "save":
        cmd_save(sys.argv[2], int(sys.argv[3]), sys.argv[4])
    else:
        raise SystemExit("lenh khong hop le: " + cmd)


if __name__ == "__main__":
    main()
