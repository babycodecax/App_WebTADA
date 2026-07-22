#!/usr/bin/env python3
"""Split converted markdown docx into per-Điều notes for the vault.

Usage:
  python split_docx_to_notes.py <converted.md> <output_dir> <doc_id> <doc_title> <source_label>

Each 'Điều N. Title' becomes one note file named <doc_id>-dieu-<N>.md.
Frontmatter follows _template.md convention with domain: tax.
"""
import sys
import io
import re
from pathlib import Path

def read_lines(path: Path) -> list[str]:
    with io.open(path, 'r', encoding='utf-8') as f:
        return f.read().split('\n')

def split_into_dieu(lines: list[str]) -> list[tuple[str, str, list[str]]]:
    """Return list of (dieu_number, dieu_title, body_lines)."""
    results = []
    current_no = None
    current_title = ''
    current_body = []
    dieu_re = re.compile(r'^Điều\s+(\d+)\.\s*(.*)$')
    for line in lines:
        m = dieu_re.match(line.strip())
        if m:
            if current_no is not None:
                results.append((current_no, current_title, current_body))
            current_no = m.group(1)
            current_title = m.group(2).strip()
            current_body = []
        else:
            if current_no is not None:
                current_body.append(line)
    if current_no is not None:
        results.append((current_no, current_title, current_body))
    return results

def slugify(text: str) -> str:
    vn = {'ă':'a','â':'a','á':'a','à':'a','ả':'a','ã':'a','ạ':'a',
          'é':'e','è':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e',
          'í':'i','ì':'i','ỉ':'i','ĩ':'i','ị':'i',
          'ó':'o','ò':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ơ':'o',
          'ú':'u','ù':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u',
          'ý':'y','ỳ':'y','ỷ':'y','ỹ':'y','ỵ':'y',
          'đ':'d','Đ':'d'}
    s = text.lower()
    for k, v in vn.items():
        s = s.replace(k, v)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')[:60]

def main():
    md_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    doc_id = sys.argv[3]
    doc_title = sys.argv[4]
    source_label = sys.argv[5]
    out_dir.mkdir(parents=True, exist_ok=True)

    lines = read_lines(md_path)
    dieu_list = split_into_dieu(lines)

    created = []
    for no, title, body in dieu_list:
        body_text = '\n'.join(body).strip()
        if not body_text:
            continue
        fname = f"{slugify(doc_id)}-dieu-{no}.md"
        fpath = out_dir / fname
        summary = body_text[:300].replace('\n', ' ')
        content = f"""---
title: {doc_id} — Điều {no}. {title}
domain: tax
tags:
  - tax
  - tax/ke-toan
source: {source_label}
status: active
updated: 2026-07-18
---

# {doc_id} — Điều {no}. {title}

## Tóm tắt
> {summary}...

## Nội dung
{body_text}

## Nguồn
- Source gốc: {source_label}

## Liên kết
- [[_index|← Về Index thuế/kế toán]]
"""
        with io.open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        created.append(fname)

    print(f"Created {len(created)} notes in {out_dir}")
    for c in created:
        print(f"  - {c}")

if __name__ == '__main__':
    main()