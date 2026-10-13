#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cua chan truoc deploy: FAIL neu worktree ban, stash ton, thieu asset.
(user duyet 13/10/2026 — chay truoc moi deploy, exit != 0 thi DUNG lai)

Kiem tra:
  1. git stash list phai rong
  2. git status --porcelain phai sach (moi thay doi phai commit truoc)
  3. moi asset /assets/* va /static/* duoc html trong api/public goi toi
     deu ton tai file tuong ung
  4. khong ton tai api/public/static/ (ban copy cu che rewrite)
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


def git_fail(proc):
    print('PREDEPLOY FAIL:')
    print(f'lenh git loi (rc={proc.returncode}): {proc.stderr.strip()[:200]}')
    return 1


def main():
    fails = []

    st = sh('git', 'stash', 'list')
    if st.returncode != 0:
        return git_fail(st)
    if st.stdout.strip():
        fails.append(f'ton stash: {st.stdout.strip().splitlines()[0]}')

    ws = sh('git', 'status', '--porcelain')
    if ws.returncode != 0:
        return git_fail(ws)
    dirty = [l for l in ws.stdout.splitlines() if l.strip()]
    if dirty:
        fails.append(f'worktree ban ({len(dirty)} file) — commit truoc khi deploy:')
        fails.extend(f'    {l}' for l in dirty[:10])

    pub = os.path.join(ROOT, 'api', 'public')
    if os.path.isdir(os.path.join(pub, 'static')):
        fails.append('ton tai api/public/static/ — xoa truoc khi deploy')

    for dirpath, _, files in os.walk(pub):
        for f in files:
            if not f.endswith('.html') or f.startswith('admin'):
                continue
            p = os.path.join(dirpath, f)
            html = open(p, encoding='utf-8', errors='replace').read()
            for u in set(re.findall(r'(?:src|href)="((?:/|static/|assets/)[^"]+)"', html)):
                if u.startswith('//'):
                    continue
                u = u.split('?')[0]
                if not re.search(r'\.(js|css|png|jpg|jpeg|webp|svg|woff2|ico)$', u):
                    continue
                # /static/* -> public/* (rewrite next.config.js)
                rel = u.lstrip('/')
                if rel.startswith('static/'):
                    rel = rel[len('static/'):]
                if not os.path.isfile(os.path.join(pub, rel)):
                    fails.append(f'thieu asset: {u} (goi tu {os.path.relpath(p, pub)})')

    if fails:
        print('PREDEPLOY FAIL:')
        print('\n'.join(fails))
        return 1
    print('PREDEPLOY OK: worktree sach, stash rong, du asset.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
