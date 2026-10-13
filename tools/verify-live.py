#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quet web that sau deploy: FAIL neu trang loi hoac thieu file tinh.
(user duyet 13/10/2026 — chay sau moi deploy, exit != 0 thi dieu tra ngay)

Kiem tra:
  1. 7 trang chinh tra ve 200
  2. moi file tinh (js/css/anh/font) duoc cac trang goi toi deu 200
  3. index.html khong con goi ban cu (zalo.png, app.js doi cu)
"""
import os
import re
import sys
import urllib.request

SITE = 'https://ketoanthuetada.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Trang so sanh ref voi file DEPLOY that (api/public) — phat hien regression
COMPARE = {'/': 'api/public/index.html', '/tinh-thue': 'api/public/tinh-thue.html',
           '/audit': 'api/public/audit.html'}
PAGES = ['/', '/tinh-thue', '/blog', '/audit', '/thu-vien',
         '/blog/khai-thue-quy-3-etax-mobile-sai-nhom',
         '/blog/thong-tu-91-2026-ve-hoa-don-dien-tu-diem-moi-can-biet']
BANNED = ['img/zalo.png']


def get(url):
    try:
        r = urllib.request.urlopen(url, timeout=30)
        return r.status, r.read().decode('utf-8', 'replace')
    except Exception as e:
        return 'LOI ' + str(e)[:100], ''


def main():
    fails = []
    refs = set()
    for p in PAGES:
        st, html = get(SITE + p)
        if st != 200:
            fails.append(f'{p} -> {st}')
            continue
        for bad in BANNED:
            if bad in html:
                fails.append(f'{p} con goi ban cu: {bad}')
        for u in re.findall(r'(?:src|href)="((?:/|static/|assets/)[^"]+)"', html):
            u = u.split('?')[0]
            if re.search(r'\.(js|css|png|jpg|jpeg|webp|svg|woff2|ico)$', u):
                refs.add('/' + u.lstrip('/'))
    for u in sorted(refs):
        st, _ = get(SITE + u)
        if st != 200:
            fails.append(f'{u} -> {st}')
    import os
    for url, local in COMPARE.items():
        st, html = get(SITE + url)
        if st != 200:
            continue
        live = set(re.findall(r'(?:src|href)="((?:/|static/|assets/)[^"]+)"', html))
        try:
            wt = open(os.path.join(ROOT, local), encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        want = set(re.findall(r'(?:src|href)="((?:/|static/|assets/)[^"]+)"', wt))
        live = {u.split('?')[0] for u in live}
        want = {u.split('?')[0] for u in want}
        if live != want:
            fails.append(f'{url} lech ban: live thua {sorted(live - want)[:3]} thieu {sorted(want - live)[:3]}')
    if fails:
        print('VERIFY LIVE FAIL:')
        print('\n'.join(fails))
        return 1
    print(f'VERIFY LIVE OK: {len(PAGES)} trang + {len(refs)} file tinh.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
