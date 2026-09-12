"""Check Google indexing status for all blog URLs in sitemap."""
import urllib.request
import urllib.parse
import re
import time
import sys

def fetch(url, headers=None):
    if headers is None:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml',
        }
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='replace')

# Step 1: Get all blog URLs from sitemap
print("=== LAY DANH SACH BLOG TU SITEMAP ===", flush=True)
xml = fetch('https://ketoanthuetada.com/sitemap.xml')
blog_urls = re.findall(r'<loc>(https://ketoanthuetada\.com/blog/[^<]+)</loc>', xml)
print(f"Tong so blog URLs: {len(blog_urls)}", flush=True)

# Step 2: Check indexing via Google site: search
indexed = []
not_indexed = []
errors = []
delay = 2.0

for i, url in enumerate(blog_urls):
    slug = url.split('/blog/')[-1]
    try:
        query = f'site:{url}'
        gurl = f'https://www.google.com/search?q={urllib.parse.quote(query)}&num=1'
        resp = fetch(gurl)

        # Detect NOT indexed
        lower = resp.lower()
        if any(x in lower for x in ['did not match any documents', 'không tìm thấy', 'no results found', 'khong co ket qua']):
            not_indexed.append(slug)
            print(f'[{i+1:2d}/{len(blog_urls)}] NOT_INDEXED: {slug[:65]}', flush=True)
        elif url in resp:
            indexed.append(slug)
            print(f'[{i+1:2d}/{len(blog_urls)}] INDEXED:     {slug[:65]}', flush=True)
        else:
            # Ambiguous - check for common Google patterns
            if 'ketoanthuetada' in lower:
                indexed.append(slug)
                print(f'[{i+1:2d}/{len(blog_urls)}] LIKELY:      {slug[:65]}', flush=True)
            else:
                not_indexed.append(slug)
                print(f'[{i+1:2d}/{len(blog_urls)}] UNCLEAR:     {slug[:65]}', flush=True)

        time.sleep(delay)
    except Exception as e:
        err = str(e)[:60]
        errors.append((slug, err))
        print(f'[{i+1:2d}/{len(blog_urls)}] ERROR:       {slug[:50]} - {err}', flush=True)
        time.sleep(3)

# Summary
print('\n========================================', flush=True)
print('           KET QUA INDEXING', flush=True)
print('========================================', flush=True)
print(f'INDEXED:     {len(indexed):3d}/{len(blog_urls)}', flush=True)
print(f'NOT_INDEXED: {len(not_indexed):3d}/{len(blog_urls)}', flush=True)
print(f'ERRORS:      {len(errors):3d}/{len(blog_urls)}', flush=True)

if not_indexed:
    print(f'\n--- CHUA INDEX ({len(not_indexed)}) ---', flush=True)
    for s in not_indexed:
        print(f'  {s}', flush=True)

if errors:
    print(f'\n--- LOI ({len(errors)}) ---', flush=True)
    for s, e in errors:
        print(f'  {s}: {e}', flush=True)
