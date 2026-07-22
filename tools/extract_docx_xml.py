#!/usr/bin/env python3
"""Robust docx extractor using raw XML (avoids python-docx zip quirks)."""
import sys
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def para_text(p) -> str:
    texts = []
    for t in p.iter(W + 't'):
        if t.text:
            texts.append(t.text)
    return ''.join(texts)

def para_style(p) -> str:
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return ''
    pstyle = ppr.find(W + 'pStyle')
    if pstyle is None:
        return ''
    return pstyle.get(W + 'val', '')

def extract_lines(docx_path: Path) -> list[str]:
    with zipfile.ZipFile(docx_path) as z:
        xml_data = z.read('word/document.xml')
    root = ET.fromstring(xml_data)
    body = root.find(W + 'body')
    lines = []
    for p in body.findall(W + 'p'):
        text = para_text(p).strip()
        if not text:
            continue
        style = para_style(p)
        if style and style.lower().startswith('heading'):
            m = re.search(r'(\d+)', style)
            level = int(m.group(1)) if m else 1
            lines.append(f"{'#' * level} {text}")
        else:
            lines.append(text)
    return lines

def main():
    docx_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    lines = extract_lines(docx_path)
    text = '\n\n'.join(lines)
    if out_path:
        with io.open(out_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Saved {len(lines)} lines to {out_path}")
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(text)

if __name__ == '__main__':
    main()