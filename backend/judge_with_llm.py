#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Dùng LLM chấm 100 câu hỏi — hybrid: exact match trước, LLM cho trường hợp khó."""
import json
import os
import sys
import time
import io
import re
from dotenv import load_dotenv

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()
LLM_API_KEY = os.getenv("LLM_API_KEY", os.getenv("OPENROUTER_KEY", ""))
LLM_BASE = os.getenv("LLM_API_BASE_URL", "").rstrip("/")
if LLM_BASE.endswith("/chat/completions"):
    LLM_BASE = LLM_BASE[: -len("/chat/completions")]
elif not LLM_BASE.endswith("/v1"):
    LLM_BASE += "/v1"
LLM_MODEL = os.getenv("LLM_MODEL", "")

HEADERS = {
    "Authorization": f"Bearer {LLM_API_KEY}",
    "Content-Type": "application/json",
}


def _clean(s: str) -> str:
    s = re.sub(r'\[[^\]]+\]', '', s)  # remove [tai lieu]
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\$\\times\$', 'x', s)
    s = re.sub(r'\s+', ' ', s).strip().lower().rstrip('.')
    return s


def _exact_keyword(pairs: list[tuple[str, str]]) -> bool:
    """So sánh chính xác sau khi chuẩn hoá."""
    exp_clean = _clean(pairs[0][0])
    ans_clean = _clean(pairs[0][1])
    if exp_clean == ans_clean:
        return True
    if exp_clean in ans_clean or ans_clean in exp_clean:
        return True
    return False


def judge_fallback(ans: str, exp: str) -> bool:
    """So sánh keyword đơn giản nếu LLM judge fail."""
    e = _clean(exp)
    a = _clean(ans)
    # exact match
    if e == a:
        return True
    # substring
    if e in a or a in e:
        return True
    # số liệu match
    nums_e = re.findall(r'\d+[\d,.]*', e)
    nums_a = re.findall(r'\d+[\d,.]*', a)
    if nums_e and nums_a:
        if all(ne in nums_a for ne in nums_e):
            return True
    # keyword overlap
    stop = {'của','và','hoặc','là','được','trong','với','cho','các','có','theo','tại','từ','để','khi','nào','bao','nhiêu','không','những','một','người','thuế','thu','chi','tiền','đồng','mức','năm','phải','nộp'}
    exp_kw = [w for w in e.split() if len(w) > 2 and w not in stop]
    matched = sum(1 for w in exp_kw if w in a)
    return matched >= len(exp_kw) * 0.5 if exp_kw else False


def llm_judge(q: str, exp: str, ans: str) -> tuple[bool, str]:
    """Gọi LLM chấm. Nếu lỗi/empty → fallback keyword."""
    prompt = f"Câu hỏi: {q}\nĐáp án đúng: {exp}\nTrả lời: {ans}\n\nTrả lời ĐÚNG hoặc SAI (chỉ 1 từ):"
    try:
        resp = requests.post(
            LLM_BASE + "/chat/completions",
            json={"model": LLM_MODEL, "messages": [
                {"role": "system", "content": "Bạn là giám khảo thuế/kế toán. Chỉ trả lời ĐÚNG hoặc SAI, không thêm gì khác."},
                {"role": "user", "content": prompt},
            ], "max_tokens": 16, "temperature": 0.0, "stream": False},
            headers=HEADERS, timeout=30,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip().upper()
        if "ĐÚNG" in text or "DUNG" in text:
            return True, text
        return False, text[:30]
    except Exception as e:
        return False, f"loi_{e}"


def main():
    with open("test_compared.json", "r", encoding="utf-8") as f:
        results = json.load(f)
    with open("test_questions.json", "r", encoding="utf-8") as f:
        questions = json.load(f)

    print("===== GIAM KHAO CHAM BAI (LLM + fallback) =====\n")

    correct = 0
    llm_correct = 0
    llm_total = 0
    total_answers = 0
    details = []

    for r in results:
        i = r["i"]
        q = questions[i - 1]
        ans = r.get("ans", "").strip()
        exp = q["a"]

        if r["err"] or not ans:
            details.append({"i": i, "verdict": "KHONG_TRA_LOI"})
            print(f"  #{i:3d} ⏭️  KHONG_TRA_LOI")
            continue

        total_answers += 1

        # 1) Keyword fallback trước
        if judge_fallback(ans, exp):
            correct += 1
            details.append({"i": i, "verdict": "DUNG", "method": "keyword"})
            print(f"  #{i:3d} ✅ DUNG   {ans[:70]}")
            continue

        # 2) Nếu keyword không chắc chắn → LLM judge
        is_correct, reason = llm_judge(q["q"], exp, ans)
        llm_total += 1

        if is_correct:
            correct += 1
            llm_correct += 1
            details.append({"i": i, "verdict": "DUNG", "method": "llm", "reason": reason})
            print(f"  #{i:3d} ✅ DUNG   {ans[:70]}")
        else:
            # 3) Fallback cuối: keyword lại
            final = judge_fallback(ans, exp)
            if final:
                correct += 1
                llm_correct += 1
                details.append({"i": i, "verdict": "DUNG", "method": "llm_fallback"})
                print(f"  #{i:3d} ✅ DUNG   {ans[:70]}")
            else:
                details.append({"i": i, "verdict": "SAI", "method": "llm", "reason": reason, "ans": ans[:200], "exp": exp[:200]})
                print(f"  #{i:3d} ❌ SAI    {ans[:70]}")
                print(f"       DAP AN: {exp[:70]}")

        time.sleep(0.2)

    wrong = [d for d in details if d["verdict"] == "SAI"]
    no_ans = len([d for d in details if d["verdict"] == "KHONG_TRA_LOI"])

    print(f"\n===== KET QUA ======")
    print(f"Tong:             {len(results)}")
    print(f"Co tra loi:        {total_answers}")
    print(f"DUNG:             {correct}")
    print(f"SAI:              {len(wrong)}")
    print(f"KHONG TRA LOI:    {no_ans}")
    print(f"Ti le dung/tra loi: {correct/total_answers*100:.1f}%")
    print(f"Ti le dung/tong:  {correct/len(results)*100:.1f}%")
    if llm_total:
        print(f"LLM judge call:   {llm_total}")
        print(f"LLM judge dung:   {llm_correct}")

    if wrong:
        print(f"\n=== CHI TIET CAU SAI ({len(wrong)}) ===")
        for d in wrong:
            print(f"  #{d['i']} [{d.get('method','')}] | {d.get('ans','')[:80]}")

    with open("test_judged.json", "w", encoding="utf-8") as f:
        json.dump(details, f, ensure_ascii=False, indent=2)
    print(f"\nDa ghi: test_judged.json")


if __name__ == "__main__":
    main()
