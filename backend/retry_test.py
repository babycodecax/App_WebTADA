#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test lai 87 cau bi loi lan truoc, tung cau mot voi timeout dai."""
import json, requests, sys, io, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Doc ket qua cu
with open('test_search_results.json', 'r', encoding='utf-8') as f:
    old = json.load(f)

# Lay nhung cau bi loi
failed = [r for r in old if r.get('err')]
print(f'Can test lai: {len(failed)} cau')

with open('test_questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

results = []
for item in failed:
    idx = item['i'] - 1
    q = questions[idx]['q']
    expected = questions[idx]['a']
    start = time.time()

    try:
        resp = requests.post(
            'http://localhost:8000/api/chat',
            json={'question': q, 'top_k': 5},
            stream=True,
            timeout=(15, 120)
        )
        answer = ''
        src = 0
        has_err = False
        token_count = 0

        for line in resp.iter_lines():
            if not line:
                continue
            d = line.decode('utf-8')
            if d.startswith('data: '):
                data = json.loads(d[6:])
                if data['type'] == 'token':
                    answer += data['data']
                    token_count += 1
                elif data['type'] == 'sources':
                    src = len(data['data'])
                elif data['type'] == 'error':
                    has_err = True
                    answer = f"[LLM_ERROR] {data['data']}"
                elif data['type'] == 'done':
                    break

        elapsed = round(time.time() - start, 1)
        no_answer = not answer or answer == '(trong)'
        results.append({
            'i': item['i'],
            'q': q[:80],
            'expected': expected[:100],
            'answer': answer[:300] if answer else '(trong)',
            'src': src,
            'err': has_err,
            'no_answer': no_answer,
            'tokens': token_count,
            'time': elapsed
        })

        status = 'OK' if (not has_err and not no_answer) else 'ERR'
        print(f"  #{item['i']} {status} src={src} tok={token_count} {elapsed}s")
        print(f"      {answer[:100]}")

    except requests.Timeout:
        results.append({
            'i': item['i'], 'q': q[:80], 'expected': expected[:100],
            'answer': '[TIMEOUT]', 'src': 0, 'err': True, 'no_answer': True,
            'tokens': 0, 'time': round(time.time() - start, 1)
        })
        print(f"  #{item['i']} TIMEOUT ({round(time.time()-start,1)}s)")
    except Exception as e:
        results.append({
            'i': item['i'], 'q': q[:80], 'expected': expected[:100],
            'answer': f'[EXC] {str(e)[:80]}', 'src': 0, 'err': True,
            'no_answer': True, 'tokens': 0, 'time': round(time.time() - start, 1)
        })
        print(f"  #{item['i']} EXCEPTION: {str(e)[:60]}")

    # Ghi sau moi cau
    with open('test_retry_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

# TONG HOP
total = len(results)
ok = [r for r in results if not r['err'] and not r['no_answer']]
errs = [r for r in results if r['err']]
timeouts = [r for r in results if r['answer'] == '[TIMEOUT]']
print()
print(f'===== KET QUA TEST LAI =====')
print(f'So cau test: {total}')
print(f'Tra loi duoc: {len(ok)}/{total}')
print(f'Van loi: {len(errs)}')
print(f'  - Timeout: {len(timeouts)}')
ok_src = sum(1 for r in ok if r.get('src', 0) > 0)
print(f'Tim thay nguon (trong so OK): {ok_src}')
