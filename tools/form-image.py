#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Anh bieu mau tu van ban cong khai + khoanh do + chia 3 nhanh.
(user duyet 12/10/2026)

Nguon uu tien: PDF van ban nha nuoc cong khai (Cong bao Chinh phu,
vanban.chinhphu.vn) — tai lieu cong, khong lo ban quyen.
Fallback: anh PNG co san (VD CDN TVPL).

Cach dung:
  python tools/form-image.py --pdf URL --find "Mau so: 01/CNKD" --boxes "0.04,0.55,0.96,0.61;..." --out mau-01-cnkd --caption "..." --alt "..."
  python tools/form-image.py --img URL --boxes "..." --out ten-file --caption "..." --alt "..."

Boxes dung toa do tuong doi (0-1) de tai dung moi kich thuoc render.
Luu vao 3 nhanh: img/blog, api/public/img/blog, backend/static/img/blog.
In doan <figure> de dan vao content + dung luon lam anh post FB.
"""
import argparse
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRRORS = [
    os.path.join(ROOT, 'img', 'blog'),
    os.path.join(ROOT, 'api', 'public', 'img', 'blog'),
    os.path.join(ROOT, 'backend', 'static', 'img', 'blog'),
]
UA = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://thuvienphapluat.vn/'}


def download(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as f:
        f.write(r.read())
    return dest


def render_pdf_pages(pdf_path, needle, zoom=2.0):
    import pymupdf
    doc = pymupdf.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        if page.search_for(needle):
            out = f'{pdf_path}.p{i}.png'
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(out)
            pages.append((i, out))
    if not pages:
        raise SystemExit(f'khong tim thay "{needle}" trong PDF')
    print('trang chua mau:', [p[0] + 1 for p in pages])
    return pages


def parse_boxes(s):
    boxes = []
    for part in (s or '').split(';'):
        part = part.strip()
        if not part:
            continue
        x0, y0, x1, y1 = (float(v) for v in part.split(','))
        boxes.append((x0, y0, x1, y1))
    return boxes


def annotate(src_path, boxes, caption, out_name):
    src = Image.open(src_path).convert('RGB')
    W, H = src.size
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', max(13, W // 45))
        small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', max(11, W // 56))
    except Exception:
        font = small = ImageFont.load_default()
    cap_h = font.size + 18
    canvas = Image.new('RGB', (W, H + cap_h), 'white')
    canvas.paste(src, (0, 0))
    d = ImageDraw.Draw(canvas)
    lw = max(2, W // 340)
    for i, (fx0, fy0, fx1, fy1) in enumerate(boxes, 1):
        x0, y0, x1, y1 = int(fx0 * W), int(fy0 * H), int(fx1 * W), int(fy1 * H)
        d.rounded_rectangle([x0, y0, x1, y1], radius=8, outline=(220, 30, 30), width=lw)
        r = max(10, W // 56)
        bx, by = x0 - r - 4, (y0 + y1) // 2
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=(220, 30, 30))
        d.text((bx - 4, by - r + 1), str(i), fill='white', font=small)
    if caption:
        size = max(13, W // 45)
        while size > 10:
            font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', size)
            brand = 'ketoanthuetada.com'
            bw = d.textlength(brand, font=font)
            if d.textlength(caption, font=font) + bw + 40 <= W:
                break
            size -= 1
        d.text((10, H + 8), caption, fill=(100, 100, 100), font=font)
        d.text((W - 10 - bw, H + 8), brand, fill=(170, 170, 170), font=font)
    for m in MIRRORS:
        os.makedirs(m, exist_ok=True)
        canvas.save(os.path.join(m, out_name + '.png'))
    print('da luu:', out_name + '.png', canvas.size, 'x3 nhanh')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', help='URL PDF van ban cong khai')
    ap.add_argument('--img', help='URL anh co san (fallback)')
    ap.add_argument('--find', help='cum tu tim trang trong PDF')
    ap.add_argument('--page', type=int, default=-1, help='lay trang thu N trong cac trang tim thay (mac dinh: trang cuoi, mau thuong nam phu luc)')
    ap.add_argument('--boxes', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--caption', default='')
    ap.add_argument('--alt', default='')
    a = ap.parse_args()

    tmp = os.path.join(os.environ.get('TEMP', '/tmp'), 'opencode')
    os.makedirs(tmp, exist_ok=True)
    if a.pdf:
        if not a.find:
            raise SystemExit('thieu --find')
        pdf_path = os.path.join(tmp, a.out + '-src.pdf')
        download(a.pdf, pdf_path)
        pages = render_pdf_pages(pdf_path, a.find)
        src_img = pages[min(a.page, len(pages) - 1)][1]
    elif a.img:
        src_img = os.path.join(tmp, a.out + '-src.png')
        download(a.img, src_img)
    else:
        raise SystemExit('can --pdf hoac --img')

    annotate(src_img, parse_boxes(a.boxes), a.caption, a.out)
    print()
    print('<figure class="blog-figure">')
    print(f'<img src="/static/img/blog/{a.out}.png" alt="{a.alt}" loading="lazy" />')
    print(f'<figcaption>{a.caption}</figcaption>')
    print('</figure>')


if __name__ == '__main__':
    sys.exit(main())
