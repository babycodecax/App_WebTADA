#!/usr/bin/env python3
"""Tu dong tao anh minh hoa cho post Facebook tu mau co dinh (khong dung AI).

Usage:
    python tools/make-post-image.py hook " cau hook " --sub "dong phu" --out ten-file.jpg
    python tools/make-post-image.py stats --items "5-6 trieu ho duoc loi;10 ty nguong chon" --out ten-file.jpg
    python tools/make-post-image.py checklist --title "Tieu de" --items "viec 1;viec 2;viec 3" --out ten-file.jpg
    python tools/make-post-image.py photo "cau hook" --bg duong-dan-anh.jpg --out ten-file.jpg
    python tools/make-post-image.py auto "cau hook" --query "market vendor" --out ten-file.jpg

Che do auto: tu tim anh tren Pexels theo tu khoa, tai ve roi ghep hook.
Can PEXELS_API_KEY trong backend/.env (dang ky mien phi tai pexels.com/api).

Anh ra: 1080x1350 (doc, toi uu mobile), PNG/JPG, ten file khong dau chua keyword.
"""
import argparse
import io
import json
import os
import ssl
import sys
import unicodedata
import urllib.request
import urllib.parse
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
NAVY = (15, 42, 68)
GOLD = (232, 179, 60)
WHITE = (255, 255, 255)
LIGHT = (240, 244, 248)
DARK = (30, 30, 30)

FONT_DIR = r"C:\Windows\Fonts"
F_BOLD = os.path.join(FONT_DIR, "arialbd.ttf")
F_REG = os.path.join(FONT_DIR, "arial.ttf")
LOGO_PATH = os.path.join("img", "logo.jpg")


def font(size, bold=True):
    cands = [F_BOLD if bold else F_REG, "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
             "arialbd.ttf" if bold else "arial.ttf"]
    for p in cands:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    print("ERROR: khong tim thay font chu (can arial.ttf hoac DejaVuSans.ttf)")
    sys.exit(1)


def slugify(text):
    nfkd = unicodedata.normalize("NFD", text)
    s = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    s = s.replace("đ", "d").replace("Đ", "D").lower()
    out = []
    for c in s:
        out.append(c if (c.isalnum()) else "-")
    while "--" in "".join(out):
        out = list("".join(out).replace("--", "-"))
    return "".join(out).strip("-")


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def base():
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 220], fill=GOLD)
    d.text((60, 60), "TADA", font=font(90), fill=NAVY)
    d.text((60, 150), "DỊCH VỤ THUẾ - KẾ TOÁN", font=font(34, bold=False), fill=NAVY)
    d.rectangle([0, H - 90, W, H], fill=GOLD)
    d.text((60, H - 70), "ketoanthuetada.com", font=font(34), fill=NAVY)
    return img, d


def hook_mode(hook, sub):
    img, d = base()
    y = 330
    for line in wrap(d, hook.upper(), font(72), W - 120):
        d.text((60, y), line, font=font(72), fill=WHITE)
        y += 92
    y += 20
    for line in wrap(d, sub, font(40, bold=False), W - 120):
        d.text((60, y), line, font=font(40, bold=False), fill=GOLD)
        y += 56
    return img


def stats_mode(items):
    img, d = base()
    y = 300
    for it in items:
        parts = it.split("|", 1)
        num = parts[0].strip()
        desc = parts[1].strip() if len(parts) > 1 else ""
        d.text((60, y), num, font=font(110), fill=GOLD)
        y += 140
        for line in wrap(d, desc, font(44, bold=False), W - 120):
            d.text((60, y), line, font=font(44, bold=False), fill=WHITE)
            y += 60
        y += 50
    return img


def checklist_mode(title, items):
    img = Image.new("RGB", (W, H), LIGHT)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 220], fill=NAVY)
    d.text((60, 70), "TADA  |  CHECKLIST", font=font(54), fill=GOLD)
    y = 280
    for line in wrap(d, title.upper(), font(56), W - 120):
        d.text((60, y), line, font=font(56), fill=NAVY)
        y += 74
    y += 30
    for i, it in enumerate(items, 1):
        d.ellipse([60, y + 8, 120, y + 68], fill=GOLD)
        d.text((76, y + 8), str(i), font=font(44), fill=NAVY)
        yy = y
        for line in wrap(d, it, font(40), W - 220):
            d.text((150, yy), line, font=font(40), fill=DARK)
            yy += 54
        y = yy + 36
    d.rectangle([0, H - 90, W, H], fill=NAVY)
    d.text((60, H - 70), "ketoanthuetada.com", font=font(34), fill=GOLD)
    return img


def paste_logo(img, size=140):
    """Dan logo page goc phai tren tren dai header (ap dung moi che do).
    Tra ve img goc neu thieu file logo."""
    try:
        logo = Image.open(LOGO_PATH).convert("RGB")
    except OSError:
        print("WARN: khong thay logo:", LOGO_PATH)
        return img
    logo.thumbnail((size, size))
    logo = logo.convert("RGBA")
    px = logo.load()
    for x in range(logo.width):
        for y in range(logo.height):
            r, g, b, _ = px[x, y]
            if r > 240 and g > 240 and b > 240:
                px[x, y] = (255, 255, 255, 0)
    x = W - logo.width - 40
    y = (200 - logo.height) // 2
    img.paste(logo, (x, y), logo)
    return img


def ssl_context():
    """Dung CA bundle cua certifi neu co de tranh loi SSL tren Windows."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch_pexels(query, api_key, per_page=5):
    """Tim anh tren Pexels theo tu khoa, tra ve duong dan file tai ve."""
    import urllib.error
    try:
        q = urllib.parse.quote(query)
        req = urllib.request.Request(
            f"https://api.pexels.com/v1/search?query={q}&per_page={per_page}&orientation=portrait",
            headers={"Authorization": api_key, "User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=30, context=ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        photos = data.get("photos", [])
        if not photos:
            return None, None
        pic = photos[0]
        src = pic["src"].get("large2x") or pic["src"].get("large")
        photographer = pic.get("photographer", "Pexels")
        req2 = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req2, timeout=60, context=ssl_context()) as r2:
            raw = r2.read()
        Image.open(io.BytesIO(raw)).verify()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
            json.JSONDecodeError, KeyError, OSError) as e:
        print("ERROR: loi mang hoac du lieu Pexels:", str(e)[:120])
        return None, None
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "blog-content", "social-images")
    os.makedirs(outdir, exist_ok=True)
    tmp = os.path.join(outdir, ".pexels-tmp.jpg")
    with open(tmp, "wb") as f:
        f.write(raw)
    return tmp, photographer


def load_env_key(path, name):
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if k.strip() == name:
                        return v.strip()
    except FileNotFoundError:
        pass
    return ""


def photo_mode(bg_path, hook):
    """Ghep cau hook len anh nen Pexel theo chuan cu:
    - lam mo anh nen 70% (overlay den 70% opacity toan bo anh)
    - viet hook to trang, trang giua, co vien den
    - them logo goc phai duoi
    - KHONG co footer text, KHONG co credit nguon anh, KHONG co header vang
    """
    try:
        bg = Image.open(bg_path).convert("RGB")
    except OSError:
        print("ERROR: file --bg khong phai anh hop le:", bg_path)
        sys.exit(1)
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1))
    x = (bg.width - W) // 2
    y = (bg.height - H) // 2
    img = bg.crop((x, y, x + W, y + H))

    # lam mo anh nen 70%: overlay den 70% opacity toan bo anh
    shade = Image.new("L", (W, H), 179)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    img = Image.composite(black, img, shade).convert("RGB")
    d = ImageDraw.Draw(img)

    # viet hook noise bat, tram giua, co vien den
    hook_lines = wrap(d, hook.upper(), font(78), W - 120)
    yy = (H - len(hook_lines) * 100) // 2
    for line in hook_lines:
        tw = d.textlength(line, font=font(78))
        d.text(((W - tw) // 2, yy), line, font=font(78), fill=WHITE,
               stroke_width=3, stroke_fill=(0, 0, 0))
        yy += 100

    # them logo goc phai duoi
    try:
        logo = Image.open(LOGO_PATH).convert("RGB")
        logo.thumbnail((120, 120))
        logo = logo.convert("RGBA")
        px = logo.load()
        for lx in range(logo.width):
            for ly in range(logo.height):
                r, g, b, _ = px[lx, ly]
                if r > 240 and g > 240 and b > 240:
                    px[lx, ly] = (255, 255, 255, 0)
        img.paste(logo, (W - logo.width - 40, H - logo.height - 40), logo)
    except OSError:
        pass

    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["hook", "stats", "checklist", "photo", "auto"])
    ap.add_argument("text", nargs="?", default="")
    ap.add_argument("--bg", default="")
    ap.add_argument("--query", default="")
    ap.add_argument("--sub", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--items", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--no-logo", action="store_true", help="hook/stats/checklist: bo qua logo page")
    a = ap.parse_args()

    if a.mode == "hook":
        img = hook_mode(a.text, a.sub)
    elif a.mode == "stats":
        img = stats_mode([x.strip() for x in a.items.split(";") if x.strip()])
    elif a.mode == "photo":
        if not a.bg or not os.path.isfile(a.bg):
            print("ERROR: photo mode can file --bg hop le")
            sys.exit(1)
        img = photo_mode(a.bg, a.text)
    elif a.mode == "auto":
        key = os.environ.get("PEXELS_API_KEY", "") or load_env_key(
            os.path.join("backend", ".env"), "PEXELS_API_KEY")
        if not key:
            print("ERROR: thieu PEXELS_API_KEY (them vao backend/.env, dang ky mien phi tai pexels.com/api)")
            sys.exit(1)
        query = a.query or slugify(a.text).replace("-", " ")
        bg, photographer = fetch_pexels(query, key)
        if not bg:
            print("ERROR: Pexels khong tra anh cho tu khoa:", query)
            sys.exit(1)
        img = photo_mode(bg, a.text)
        try:
            os.remove(bg)
        except OSError:
            pass
    else:
        img = checklist_mode(a.title, [x.strip() for x in a.items.split(";") if x.strip()])

    outdir = os.path.join("tools", "blog-content", "social-images")
    os.makedirs(outdir, exist_ok=True)
    name = a.out or (slugify(a.title or a.text)[:60] + ".jpg")
    if not name.endswith((".jpg", ".png")):
        name += ".jpg"
    path = os.path.join(outdir, name)
    if a.mode not in ("photo", "auto") and not a.no_logo:
        img = paste_logo(img)
    img.save(path, quality=90)
    print("SAVED:", path)


if __name__ == "__main__":
    main()
