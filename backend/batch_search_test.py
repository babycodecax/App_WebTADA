#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test chi phan search (BM25) cho 100 cau - nhanh, khong can LLM."""
import json, requests, sys, io, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('test_questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

# Goi API /api/chat va doc luon sources (ko can stream full)
results = []
for idx, item in enumerate(questions):
    start = time.time()
    try:
        resp = requests.post('http://localhost:8000/api/chat',
            json={'question': item['q'], 'top_k': 5},
            stream=True, timeout=(10, 120))
        src = 0
        ans = ''
        err = False
        no_ans = False
        for line in resp.iter_lines():
            if not line: continue
            d = line.decode('utf-8')
            if d.startswith('data: '):
                data = json.loads(d[6:])
                if data['type'] == 'sources':
                    src = len(data['data'])
                elif data['type'] == 'token':
                    ans += data['data']
                elif data['type'] == 'error':
                    err = True
                elif data['type'] == 'done':
                    break
        results.append({
            'i': idx + 1,
            'section': item.get('section', ''),
            'q': item['q'][:80],
            'expected': item['a'][:100],
            'answer': ans[:200] if ans else '(trong)',
            'src': src,
            'err': err,
            'no_answer': not ans or ans == '(trong)',
            'time': round(time.time() - start, 1)
        })
    except Exception as e:
        results.append({
            'i': idx + 1, 'section': item.get('section', ''),
            'q': item['q'][:80], 'expected': item['a'][:100],
            'answer': f'TIMEOUT', 'src': 0, 'err': True,
            'no_answer': True, 'time': round(time.time() - start, 1)
        })

    if (idx + 1) % 10 == 0:
        print(f'{idx+1}/{len(questions)}', flush=True)

with open('test_search_results.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

total = len(results)
ok = sum(1 for r in results if not r['err'] and not r.get('no_answer', False))
no_src = sum(1 for r in results if r['src'] == 0 and not r['err'])
errs = sum(1 for r in results if r['err'])
no_ans = sum(1 for r in results if r.get('no_answer', False) and not r['err'])
with_src = sum(1 for r in results if r['src'] > 0 and not r['err'])

print()
print('===== KET QUA SEARCH =====')
print(f'Tong: {total}')
print(f'Co cau tra loi: {ok}/{total} ({ok/total*100:.1f}%)')
print(f'Co nguon (source>0): {with_src}')
print(f'Khong nguon: {no_src}')
print(f'Loi request: {errs}')
print(f'Khong co noi dung: {no_ans}')
print(f'Tong time: {sum(r["time"] for r in results):.0f}s')
print()

# Chi tiet cac cau khong co nguon
if no_src > 0:
    print('===== CAU KHONG CO NGUON =====')
    for r in results:
        if r['src'] == 0 and not r['err']:
            print(f"  #{r['i']} [{r.get('section','')[:30]}] {r['q'][:70]}")

print()
# Phan bo theo section
from collections import Counter
sec_counts = Counter(r.get('section','') for r in results if r['src'] > 0 and not r['err'])
print('===== PHAN BO CO NGUON THEO SECTION =====')
for sec, cnt in sec_counts.most_common():
    print(f"  {sec[:50]}: {cnt}")
