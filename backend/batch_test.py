#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test theo batch, ghi file ngay sau moi cau."""
import json, requests, sys, io, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('test_questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

results_file = 'test_batch_results.json'

# Load existing results if any
if os.path.exists(results_file):
    with open(results_file, 'r', encoding='utf-8') as f:
        results = json.load(f)
    done = max(r['i'] for r in results) if results else 0
    print(f"Resuming from #{done}")
else:
    results = []
    done = 0

for idx in range(done, len(questions)):
    item = questions[idx]
    start = time.time()
    try:
        resp = requests.post('http://localhost:8000/api/chat',
            json={'question': item['q'], 'top_k': 5},
            stream=True, timeout=(10, 120))
        ans = ''
        src = 0
        err = False
        for line in resp.iter_lines():
            if not line: continue
            d = line.decode('utf-8')
            if d.startswith('data: '):
                data = json.loads(d[6:])
                if data['type'] == 'token': ans += data['data']
                elif data['type'] == 'sources': src = len(data['data'])
                elif data['type'] == 'error': ans = data['data']; err = True
                elif data['type'] == 'done': break
        results.append({
            'i': idx + 1,
            'expected': item['a'][:100],
            'answer': ans[:300] if ans else '(trong)',
            'src': src,
            'err': err,
            'no_answer': not ans or ans == '(trong)',
            'time': round(time.time() - start, 1)
        })
    except Exception as e:
        results.append({
            'i': idx + 1, 'expected': item['a'][:100],
            'answer': f'[TIMEOUT]', 'src': 0, 'err': True,
            'no_answer': True, 'time': round(time.time() - start, 1)
        })

    # Ghi ngay sau moi cau
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"#{idx+1} src={results[-1]['src']} err={results[-1]['err']} ({results[-1]['time']}s)", flush=True)

# Summary
total = len(results)
ok = sum(1 for r in results if not r['err'] and not r.get('no_answer', False))
no_src = sum(1 for r in results if r['src'] == 0 and not r['err'])
errs = sum(1 for r in results if r['err'])
with_src = sum(1 for r in results if r['src'] > 0 and not r['err'])
total_time = sum(r['time'] for r in results)

print()
print('===== KET QUA =====')
print(f'Tong: {total}')
print(f'Co cau tra loi: {ok}/{total} ({ok/total*100:.1f}%)')
print(f'Co nguon (source>0): {with_src}')
print(f'Khong nguon: {no_src}')
print(f'Loi: {errs}')
print(f'Tong thoi gian: {total_time:.0f}s')
print(f'Trung binh: {total_time/total:.1f}s/cau')
