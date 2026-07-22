#!/usr/bin/env python3
"""Extract text from docx files and convert to markdown."""
import sys
import io
from pathlib import Path
from docx import Document

def extract_docx(docx_path: Path) -> str:
    doc = Document(docx_path)
    lines = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        # Detect headings by style
        if para.style.name.startswith('Heading'):
            level = int(para.style.name[-1]) if para.style.name[-1].isdigit() else 1
            lines.append(f"{'#' * level} {text}")
        else:
            lines.append(text)
    return '\n\n'.join(lines)

if __name__ == '__main__':
    docx_file = Path(sys.argv[1])
    output_file = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    md = extract_docx(docx_file)

    if output_file:
        with io.open(output_file, 'w', encoding='utf-8') as f:
            f.write(md)
        print(f"Saved to {output_file}")
    else:
        # Write to stdout as UTF-8
        sys.stdout.reconfigure(encoding='utf-8')
        print(md)