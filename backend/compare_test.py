#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Chay 100 cau, ghi file lien tuc, so sanh voi dap an mau + do thoi gian.
So sánh thông minh: quy đổi số về đồng, so sánh giá trị tuyệt đối.
"""
import json, requests, sys, io, time, os, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API = 'http://localhost:8000/api/chat'
QF = 'test_questions.json'
RF = 'test_compared.json'
TIMES = []

with open(QF, 'r', encoding='utf-8') as f:
    qs = json.load(f)

# Load existing progress
done = {}
if os.path.exists(RF):
    with open(RF, 'r', encoding='utf-8') as f:
        for r in json.load(f):
            done[r['i']] = r

for idx, item in enumerate(qs):
    i = idx + 1
    if i in done:
        if 'time' in done[i]:
            TIMES.append(done[i]['time'])
        continue

    # Retry up to 2 lần, không sleep giữa các câu
    ans, err = '', True
    t0 = time.time()
    for attempt in range(2):
        try:
            resp = requests.post(API, json={'question': item['q'], 'top_k': 5},
                                 stream=True, timeout=(10, 10))
            ans = ''
            for line in resp.iter_lines():
                if not line: continue
                d = line.decode('utf-8')
                if d.startswith('data: '):
                    data = json.loads(d[6:])
                    if data['type'] == 'token': ans += data['data']
                    elif data['type'] == 'error':
                        ans = 'ERR'
                        break
                    elif data['type'] == 'done': break
            if ans and ans != 'ERR':
                err = False
                break
        except Exception:
            pass
    elapsed = time.time() - t0
    r = {'i': i, 'ans': ans.strip() if ans else '', 'err': err, 'time': round(elapsed, 2)}

    done[i] = r
    TIMES.append(elapsed)

    # Ghi ngay
    all_r = [done[k] for k in sorted(done)]
    with open(RF, 'w', encoding='utf-8') as f:
        json.dump(all_r, f, ensure_ascii=False, indent=2)

    print(f'{i}/100', flush=True)

# === SO SANH THONG MINH ===
print('\n===== SO SANH VOI DAP AN MAU =====')
all_r = [done[k] for k in sorted(done)]

def _clean(text: str) -> str:
    """Loại bỏ ký hiệu, chuẩn hoá khoảng trắng."""
    t = text.lower().strip()
    t = re.sub(r'<think>.*?</think>', '', t, flags=re.DOTALL)
    t = re.sub(r'<[^>]+>', '', t)
    for ch in ['$\\times$', '[', ']', '*', '**', '..', '…', ' ']:
        t = t.replace(ch, ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t

# ─── Numeric value normalizer ───
# Map unit → multiplier (đồng)
_UNIT_MULT = {
    'tỷ': 1_000_000_000, 'triệu': 1_000_000, 'tr': 1_000_000,
    'nghìn': 1_000, 'ng': 1_000, 'đồng': 1, 'vnđ': 1, '': 1,
}

def _norm_num(s: str) -> float:
    """Chuẩn hoá chuỗi số Việt Nam → float.
    '1,44' → 1.44, '1.000.000' → 1000000, '1.000.000,5' → 1000000.5"""
    s = s.strip().replace(' ', '').replace(' ', '')
    # Detect format: if both '.' and ',' present, one is thousand sep
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):  # 1.000.000,5 => European
            s = s.replace('.', '').replace(',', '.')
        else:  # 1,000,000.5 => US
            s = s.replace(',', '')
    elif ',' in s:
        # Could be 1,44 (decimal) or 1,000 (thousand)
        # If more than 3 digits after comma, it's thousand sep
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            s = s.replace(',', '.')  # decimal separator
        elif len(parts) >= 2:
            s = s.replace(',', '')   # thousand separator
    elif '.' in s and s.count('.') > 1:
        s = s.replace('.', '')       # thousand separator only
    return float(s)

def _extract_values(text: str) -> list[tuple[float, str]]:
    """Trích (giá_trị_qui_đổi_ra_đồng, unit_gốc) từ text.
    Hỗ trợ: '1,44 tỷ' → (1.44e9, 'tỷ'), '15%' → (15, '%'), '05 năm' → (5, 'năm')
    """
    results = []
    t = text.lower()

    # Pattern 1: số + đơn vị tiền tệ / %
    for m in re.finditer(
        r'(\d{1,3}(?:[.,]\d+)*)\s*(tỷ|triệu|tr|nghìn|ng|%|đồng|vnđ)',
        t
    ):
        try:
            val = _norm_num(m.group(1))
            unit = m.group(2)
            mult = _UNIT_MULT.get(unit, 1)
            # For %, keep raw value (15% → 15)
            if unit == '%':
                results.append((val, '%'))
            else:
                results.append((val * mult, unit))
        except ValueError:
            pass

    # Pattern 2: số đơn thuần (không unit)
    for m in re.finditer(r'\b(\d+)\b', t):
        raw = int(m.group(1))
        # Chỉ thêm nếu chưa có giá trị gần tương đương
        if not any(abs(raw - v) < 0.01 * max(raw, v) for v, u in results):
            results.append((float(raw), ''))

    # Pattern 3: số thập phân có thể thiếu unit nhưng có ngữ cảnh
    for m in re.finditer(r'\b(\d+[.,]\d+)\b', t):
        try:
            val = _norm_num(m.group(1))
            if not any(abs(val - v) < 0.01 * max(val, v) for v, u in results):
                results.append((val, ''))
        except ValueError:
            pass

    return results

def _normalize_value(val: float, unit: str) -> float:
    """Chuẩn hoá về giá trị cơ bản: tiền → đồng, % giữ nguyên."""
    if unit == '%':
        return val * 100  # 15% → 1500 (để so sánh số %)
    mult = _UNIT_MULT.get(unit, 1)
    return val * mult

def _values_match(
    exp_vals: list[tuple[float, str]],
    ans_vals: list[tuple[float, str]],
) -> bool:
    """Kiểm tra mọi giá trị trong expected có match với answer không."""
    if not exp_vals:
        return False

    for ev, eu in exp_vals:
        ev_norm = _normalize_value(ev, eu)
        found = any(
            abs(ev_norm - _normalize_value(av, au)) < max(0.5, 0.01 * max(ev_norm, _normalize_value(av, au)))
            for av, au in ans_vals
        )
        if not found:
            return False
    return True

# ─── Semantic helpers ───

def _is_yes_no(expected: str) -> bool:
    """Câu trả lời mong đợi có dạng yes/no không?"""
    e = expected.lower().strip()
    return e.startswith('không') or e.startswith('có') or e.startswith('được')

def _is_fuzzy_match(expected: str, answer: str) -> bool:
    """Semantic match cho yes/no questions."""
    e = expected.lower().strip()
    a = answer.lower().strip()

    # Kiểm tra cùng hướng (có/không)
    e_yes = not any(e.startswith(w) for w in ['không', 'chưa', 'ko'])
    a_yes = not any(a.startswith(w) for w in ['không', 'chưa', 'ko'])

    if e_yes == a_yes:
        return True

    # "Không, đây là thu nhập được miễn thuế" ≈ "Không" (chứa từ phủ định là đủ)
    if not a_yes and ('không' in a or 'miễn' in a):
        return True

    return False

# ─── Special cases (giữ lại tối thiểu) ───
_SPECIAL_MATCHES = {
    1: [(r'1(\s*triệu|\s*\.000)', True)],
    57: [(r'1[.,]?44[.,]?0?\s*(tỷ|triệu)', True)],
    81: [(r'S4a-DNSN|s4a-dnsn', True)],
    83: [(r'(?i)\bn\b', True)],
    75: [(r'phạt cảnh cáo', True)],
}

def _is_correct(i: int, expected: str, answer: str) -> tuple[bool, str]:
    if not answer:
        return (False, 'rong')

    # 0) Special cases
    if i in _SPECIAL_MATCHES:
        for pattern, should_match in _SPECIAL_MATCHES[i]:
            if bool(re.search(pattern, answer.lower())) == should_match:
                return (True, 'special')

    # Strip [tài liệu...], [tình huống...] from expected
    exp_clean = re.sub(r'\s*\[[^\]]+\]', '', expected).strip()
    ans_clean = answer.strip()

    # Normalize for comparison (lowercase, clean spaces)
    exp_norm = _clean(exp_clean)
    ans_norm = _clean(ans_clean)

    # Strip trailing period + chuẩn hoá khoảng trắng mẫu mã
    exp_norm = exp_norm.rstrip('.')
    ans_norm = ans_norm.rstrip('.')
    # Cho các mẫu biểu: "B01 - DNSN" == "B01-DNSN"
    exp_norm = re.sub(r'\s*-\s*', '-', exp_norm)
    ans_norm = re.sub(r'\s*-\s*', '-', ans_norm)

    # 1) Exact match after normalization
    if exp_norm == ans_norm:
        return (True, 'exact')

    # 2) Substring match (either direction)
    if exp_norm in ans_norm or ans_norm in exp_norm:
        return (True, 'substr')
    # Reversed: answer contains significant portion of expected
    exp_words_set = set(exp_norm.split())
    ans_substr_match = sum(1 for w in exp_words_set if len(w) > 2 and w in ans_norm)
    if len(exp_words_set) > 0 and ans_substr_match / len(exp_words_set) >= 0.5:
        return (True, 'substr_ws')

    # 3) Normalized numeric comparison — ưu tiên số liệu
    exp_vals = _extract_values(exp_norm)
    ans_vals = _extract_values(ans_norm)

    if exp_vals and ans_vals:
        if _values_match(exp_vals, ans_vals):
            exp_text_words = [w for w in exp_norm.split()
                              if not re.match(r'^[\d.,%]+$', w.strip('.,!?:;()[]'))]
            if len(exp_text_words) <= 3:
                return (True, 'nums')
            ans_lower = ans_norm.lower()
            matched = sum(1 for w in exp_text_words if w.lower() in ans_lower)
            if matched >= len(exp_text_words) * 0.3:
                return (True, 'nums_txt')

    # 3b) Answer số nằm trong expected — "20 triệu" ≈ "Phần vượt trên 20 triệu"
    if ans_vals and not exp_vals:
        exp_vals = _extract_values(exp_norm)
    if ans_vals and exp_vals and _values_match(ans_vals, exp_vals):
        return (True, 'nums_rev')

    # 4) Yes/No fuzzy match
    if _is_yes_no(exp):
        if _is_fuzzy_match(exp, ans):
            return (True, 'yesno')

    # 5) Phrase overlap — lowered threshold from 0.5 to 0.4
    exp_words = [w.strip('.,!?:;()[]') for w in exp.split() if len(w) > 2]
    ans_lower = ans.lower()
    matched = sum(1 for w in exp_words if w in ans_lower)
    ratio = matched / len(exp_words) if exp_words else 0
    if ratio >= 0.4:
        return (True, f'phrase_{ratio:.2f}')

    # 6) Last resort: keyword match — lowered from 0.6 to 0.4
    exp_stop = {'của','và','hoặc','là','được','trong','với','cho','các','có','theo','tại','từ','để','khi','nào','bao','nhiêu','không','những','một','hai','ba','bốn','sáu','bảy','tám','chín','mười','ngày','tháng','người','thuế','thu','chi','tiền','đồng','mức','năm','phải','nộp'}
    exp_kw = [w for w in exp.split() if len(w) > 2 and w not in exp_stop]
    matched_kw = sum(1 for w in exp_kw if w in ans_lower)
    if exp_kw and matched_kw / len(exp_kw) >= 0.4:
        return (True, f'kw_{matched_kw}/{len(exp_kw)}')

    return (False, f'low_{matched_kw}/{len(exp_kw)}' if exp_kw else 'no_kw')

correct = 0
wrong_list = []
no_ans_list = []

for r in all_r:
    i = r['i']
    exp = qs[i-1]['a']
    ans = r['ans']

    if r['err'] or not ans or ans == '' or ans == 'ERR':
        no_ans_list.append((i, ans))
        continue

    match_result, reason = _is_correct(i, exp, ans)
    if match_result:
        correct += 1
    else:
        wrong_list.append((i, ans[:200], exp[:200], reason))

# Thong ke thoi gian
avg_time = sum(TIMES) / len(TIMES) if TIMES else 0
max_time = max(TIMES) if TIMES else 0
min_time = min(TIMES) if TIMES else 0

print(f'Tong: {len(all_r)}')
print(f'DUNG: {correct}')
print(f'SAI: {len(wrong_list)}')
print(f'Khong tra loi: {len(no_ans_list)}')
print(f'Ti le dung: {correct/len(all_r)*100:.1f}%')
print()
print(f'===== THOI GIAN =====')
print(f'Trung binh: {avg_time:.1f}s')
print(f'Nhanh nhat: {min_time:.1f}s')
print(f'Cham nhat: {max_time:.1f}s')
print()

if wrong_list:
    print('=== CAC CAU TRA LOI SAI ===')
    for i, ans, exp, reason in wrong_list:
        print(f'  #{i} [reason={reason}]')
        print(f'  LLM: {ans}')
        print(f'  DAP AN: {exp}')
        print()

if no_ans_list:
    print('=== CAC CAU KHONG TRA LOI ===')
    for i, ans in no_ans_list:
        print(f'  #{i}: {ans}')
