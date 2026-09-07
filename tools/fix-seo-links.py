"""Fix SEO footer: rename 'Bài viết liên quan' to 'Đọc thêm' and remove /blog/ from URLs."""
import os
import re

DIR = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(DIR, 'blog-content', 'old-posts')

fixed = 0
skipped = 0

for fname in sorted(os.listdir(POSTS_DIR)):
    if not fname.endswith('.md'):
        continue
    fpath = os.path.join(POSTS_DIR, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. Replace "Bài viết liên quan" with "Đọc thêm"
    content = content.replace('**Bài viết liên quan:**', '**Đọc thêm:**')

    # 2. Remove /blog/ from URLs (ketoanthuetada.com/blog/slug -> ketoanthuetada.com/slug)
    content = content.replace('ketoanthuetada.com/blog/', 'ketoanthuetada.com/')

    if content != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        fixed += 1
        print(f'FIXED: {fname}')
    else:
        skipped += 1
        print(f'OK (no change): {fname}')

print(f'\nDone: {fixed} fixed, {skipped} unchanged')
