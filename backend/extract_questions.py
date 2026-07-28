#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Trich xuat cau hoi tu Test1.docx"""
import docx
import json
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

doc = docx.Document(r'../Test/Test1.docx')
lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

questions = []
current_section = ''

DA = 'Đáp án:'  # Đáp án:

for line in lines:
    if re.match(r'^[IVX]+\.\s', line):
        current_section = line
        continue
    if DA in line:
        parts = line.split(DA, 1)
        q_text = parts[0].strip()
        q_text = re.sub(r'\?+$', '', q_text).strip()
        answer = parts[1].strip()
        questions.append({
            'q': q_text,
            'a': answer,
            'section': current_section
        })

with open('test_questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f'Parsed {len(questions)} questions')
if questions:
    print(f'First Q: {questions[0]["q"][:60]}')
    print(f'First A: {questions[0]["a"][:60]}')
