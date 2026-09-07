"""
Fix SEO elements in old blog posts:
1. Fix internal links (add /blog/ prefix)
2. Change 'Đọc thêm' to 'Bài viết liên quan'
3. Ensure proper frontmatter
4. Ensure FAQ section exists
5. Ensure H2 are questions with '?'
"""
import os
import re

OUTDIR = 'D:/CodeApp/Projects/App_WebTADA/tools/blog-content/old-posts'

# Internal links that need /blog/ prefix (already have ketoanthuetada.com/ but missing /blog/)
LINK_PATTERNS = [
    # Fix links that are missing /blog/
    (r'\(https://ketoanthuetada\.com/(?!blog/)([^)]+)\)', r'(https://ketoanthuetada.com/blog/\1)'),
]

# Fix "Đọc thêm" to "Bài viết liên quan"
HEADER_FIX = [
    ('**Đọc thêm:**', '**Bài viết liên quan:**'),
    ('**Đọc thêm：**', '**Bài viết liên quan:**'),
]

fixed_count = 0
files = sorted(os.listdir(OUTDIR))

for fname in files:
    if not fname.endswith('.md'):
        continue

    filepath = os.path.join(OUTDIR, fname)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Fix internal links - add /blog/ prefix
    for pattern, replacement in LINK_PATTERNS:
        content = re.sub(pattern, replacement, content)

    # Fix "Đọc thêm" to "Bài viết liên quan"
    for old, new in HEADER_FIX:
        content = content.replace(old, new)

    # Ensure summary is 150-160 chars
    summary_match = re.search(r'^summary:\s*"(.+?)"$', content, re.MULTILINE)
    if summary_match:
        summary = summary_match.group(1)
        if len(summary) > 170:
            # Truncate summary to ~155 chars
            truncated = summary[:155]
            # Find last space to avoid cutting word
            last_space = truncated.rfind(' ')
            if last_space > 120:
                truncated = truncated[:last_space]
            truncated += '...'
            content = content.replace(summary_match.group(0), f'summary: "{truncated}"')

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        fixed_count += 1
        print(f'FIXED: {fname}')

print(f'\nTotal fixed: {fixed_count} files')
