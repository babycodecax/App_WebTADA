#!/usr/bin/env python3
"""Duc san 5 bai moi nhat vao #blog-mini-grid trong index.html (3 ban).
JS van chay de len nhu cu, Google thay link ngay lan dau. Chay truoc moi deploy."""
import html
import json
import urllib.request
from datetime import datetime

FILES = ['index.html', 'api/public/index.html', 'backend/static/index.html']
PLACEHOLDER = '<div class="blog-loading">'
MONTHS = {1: 'tháng 1', 2: 'tháng 2', 3: 'tháng 3', 4: 'tháng 4', 5: 'tháng 5', 6: 'tháng 6',
          7: 'tháng 7', 8: 'tháng 8', 9: 'tháng 9', 10: 'tháng 10', 11: 'tháng 11', 12: 'tháng 12'}


def load_env(p):
    e = {}
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip()
    return e


def fmt(iso):
    if not iso:
        return ''
    d = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return 'ngày %d %s năm %d' % (d.day, MONTHS[d.month], d.year)


env = load_env('backend/.env')
base, key = env['SUPABASE_URL'], env['SUPABASE_KEY']
url = base + '/rest/v1/blog_posts?select=slug,title,published_at&status=eq.published&order=published_at.desc&limit=5'
req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
posts = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))

cards = []
for i, p in enumerate(posts):
    cards.append(
        '<a class="blog-mini-card" href="/blog/%s" style="--i: %d;">'
        '<span class="blog-mini-num" aria-hidden="true">%02d</span>'
        '<span class="blog-mini-text"><h3>%s</h3>'
        '<div class="date">%s</div></span></a>'
        % (p['slug'], i, i + 1, html.escape(p['title']), fmt(p.get('published_at'))))
static_html = ''.join(cards)

for f in FILES:
    t = open(f, encoding='utf-8').read()
    if PLACEHOLDER not in t:
        print('SKIP (khong thay placeholder):', f)
        continue
    t = t.replace(PLACEHOLDER + 'Đang tải bài viết...</div>', static_html, 1)
    open(f, 'w', encoding='utf-8').write(t)
    print('INJECTED 5 posts ->', f)
