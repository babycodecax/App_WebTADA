#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Retest 87 failed questions with better settings."""
import json, requests, sys, io, time, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('test_retry_results.json', 'r', encoding='utf-8') as f:
    done = {r['i'] for r in json.load(f)}

with open('test_search_results.json', 'r', encoding='utf-8') as f:
    old = json.load(f)

failed = [r for r in old if r.get('err') and r['i'] not in done]

if not failed:
    print('Khong co cau nao can test lai!')
    sys.exit(0)

print(f'Con lai: {len(failed)} cau can test')

with open('test_questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

def load_partial():
    if os.path.exists('test_retry_results.json'):
        with open('test_retry_results.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

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
            timeout=(15, 180)
        )
        answer = ''
        src = 0
        has_err = False
        token_count = 0
        streaming = False

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
                    answer = f"[LLM_ERR] {data['data']}"
                elif data['type'] == 'done':
                    break

        elapsed = round(time.time() - start, 1)
        no_answer = not answer or answer == '(trong)'

    except requests.Timeout:
        elapsed = round(time.time() - start, 1)
        ans_text = '[TIMEOUT]'
        has_err = True
        no_answer = True
        src = 0
        token_count = 0
        answer = ans_text
    except Exception as e:
        elapsed = round(time.time() - start, 1)
        answer = f'[EXC] {str(e)[:80]}'
        has_err = True
        no_answer = True
        src = 0
        token_count = 0

    result = {
        'i': item['i'], 'q': q[:80], 'expected': expected[:100],
        'answer': answer[:300] if answer else '(trong)',
        'src': src, 'err': has_err, 'no_answer': no_answer,
        'tokens': token_count, 'time': elapsed
    }

    results = load_partial()
    results.append(result)
    with open('test_retry_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    status = 'OK' if (not has_err and not no_answer) else \
             'TIMEOUT' if '[TIMEOUT]' in str(answer) else 'ERR'
    print(f"#{item['i']} {status} src={src} tok={token_count} {elapsed}s")
    if not has_err and not no_answer:
        print(f"  -> {answer[:100]}")

# Final summary
all_results = load_partial()
ok = [r for r in all_results if not r['err'] and not r['no_answer']]
err = [r for r in all_results if r['err']]
timeouts = [r for r in err if '[TIMEOUT]' in str(r.get('answer',''))]
other_errors = [r for r in err if '[TIMEOUT]' not in str(r.get('answer',''))]

print()
print(f'===== TONG KET =====')
print(f'Tong: {len(all_results)}')
print(f'OK: {len(ok)}')
print(f'Timeouts: {len(timeouts)}')
print(f'Loi khac: {len(other_errors)}')

# Check answer quality for OK ones
correct = 0
for r in ok:
    exp = r['expected'].lower()[:50]
    ans = r['answer'].lower()[:50]
    # Simple check: does answer contain key info from expected?
    key_words = [w for w in exp.split() if len(w) > 3][:3]
    if any(w in ans for w in key_words):
        correct += 1

print(f'Co ve dung (du tu khoa): ~{correct}/{len(ok)}')
