#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Kiem tra 100 cau hoi voi timeout moi cau."""
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests

with open('test_questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

results = []
for i, item in enumerate(questions):
    q = item['q']
    try:
        resp = requests.post(
            'http://localhost:8000/api/chat',
            json={'question': q, 'top_k': 5},
            stream=True,
            timeout=(10, 45)
        )
        answer = ''
        sources_count = 0
        has_error = False
        for line in resp.iter_lines():
            if not line:
                continue
            try:
                decoded = line.decode('utf-8')
            except Exception:
                continue
            if decoded.startswith('data: '):
                try:
                    data = json.loads(decoded[6:])
                except Exception:
                    continue
                if data['type'] == 'token':
                    answer += data['data']
                elif data['type'] == 'sources':
                    sources_count = len(data['data'])
                elif data['type'] == 'error':
                    has_error = True
                    answer = data['data']
                elif data['type'] == 'done':
                    break

        results.append({
            'i': i + 1,
            'expected': item['a'][:100],
            'answer': answer[:200] if answer else '(trong)',
            'src': sources_count,
            'err': has_error,
            'no_answer': not answer or answer == '(trong)'
        })
    except requests.Timeout:
        results.append({
            'i': i + 1, 'expected': item['a'][:100],
            'answer': '[TIMEOUT]', 'src': 0, 'err': True, 'no_answer': True
        })
    except Exception as e:
        results.append({
            'i': i + 1, 'expected': item['a'][:100],
            'answer': f'[ERR] {str(e)[:80]}', 'src': 0, 'err': True, 'no_answer': True
        })

    if (i + 1) % 5 == 0:
        print(f'>>> {i+1}/{len(questions)}', flush=True)

with open('test_results2.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

total = len(results)
ok = sum(1 for r in results if not r['err'] and not r.get('no_answer', False))
no_src = sum(1 for r in results if r['src'] == 0 and not r['err'])
errs = sum(1 for r in results if r['err'])
no_ans = sum(1 for r in results if r.get('no_answer', False) and not r['err'])
with_src = sum(1 for r in results if r['src'] > 0 and not r['err'])

print()
print('===== KET QUA =====')
print(f'Tong: {total}')
print(f'Co cau tra loi: {ok}/{total} ({ok/total*100:.1f}%)')
print(f'Co nguon: {with_src}')
print(f'Khong nguon: {no_src}')
print(f'Loi: {errs}')
print()

# Chi tiet
issues = [r for r in results if r['err'] or r.get('no_answer', False) or r['src'] == 0]
if issues:
    print('===== CAC CAU CO VAN DE =====')
    for r in issues:
        if r['err']:
            print(f"  #{r['i']} LOI: {r['answer'][:80]}")
        elif r.get('no_answer', False):
            print(f"  #{r['i']} TRONG: src={r['src']}")
        elif r['src'] == 0:
            print(f"  #{r['i']} KO NGUON")
