"""Check 24 undiscovered URLs for noindex, internal links, content quality."""
import urllib.request
import re
import time
import sys

# 24 URLs from GSC "Discovered but not indexed"
URLS = [
    "https://ketoanthuetada.com/blog/cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026",
    "https://ketoanthuetada.com/blog/chuyen-trang-thai-ma-so-thue-tu-03-sang-06",
    "https://ketoanthuetada.com/blog/hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai",
    "https://ketoanthuetada.com/blog/hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026",
    "https://ketoanthuetada.com/blog/huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026",
    "https://ketoanthuetada.com/blog/huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue",
    "https://ketoanthuetada.com/blog/huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026",
    "https://ketoanthuetada.com/blog/kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026",
    "https://ketoanthuetada.com/blog/lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly",
    "https://ketoanthuetada.com/blog/lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026",
]

# Also get remaining 14 from sitemap but not in indexed list (from GSC we know 19 indexed)
# We'll check all blog URLs and cross-reference

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def fetch(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    req = urllib.request.Request(url, headers=headers)
    data = urllib.request.urlopen(req, timeout=15).read()
    # Try utf-8 first, fallback to latin-1
    try:
        return data.decode('utf-8')
    except:
        return data.decode('latin-1', errors='replace')

# Step 1: Get all blog URLs from sitemap
print("=== LAY SITEMAP ===", flush=True)
xml = fetch("https://ketoanthuetada.com/sitemap.xml")
all_blog_urls = re.findall(r'<loc>(https://ketoanthuetada\.com/blog/[^<]+)</loc>', xml)
print(f"Tong blog URLs: {len(all_blog_urls)}", flush=True)

# Step 2: Check each URL for noindex + word count
print("\n=== KIEM TRA TUNG URL ===", flush=True)
results = []
for i, url in enumerate(all_blog_urls):
    slug = url.split("/blog/")[-1]
    try:
        html = fetch(url)

        # Check noindex
        has_noindex = 'noindex' in html.lower() and ('<meta' in html.lower())

        # Check title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html)
        title = title_match.group(1).strip() if title_match else "NO TITLE"

        # Count words (approximate)
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text)
        word_count = len(text.split())

        # Check canonical
        canonical_match = re.search(r'<link[^>]*rel="canonical"[^>]*href="([^"]+)"', html)
        canonical = canonical_match.group(1) if canonical_match else "NONE"

        is_in_24 = url in URLS
        status = "NOT_INDEXED" if is_in_24 else "INDEXED"

        flag = ""
        if has_noindex:
            flag += " ⚠️NOINDEX"
        if word_count < 300:
            flag += " ⚠️SHORT"
        if canonical != url:
            flag += f" ⚠️CANONICAL={canonical}"

        print(f"[{i+1:2d}/{len(all_blog_urls)}] {status:12s} {word_count:5d}w{flag:30s} {slug[:55]}", flush=True)
        results.append({
            'url': url,
            'slug': slug,
            'status': status,
            'title': title[:60],
            'words': word_count,
            'noindex': has_noindex,
            'canonical': canonical,
            'flags': flag.strip(),
        })
        time.sleep(1)
    except Exception as e:
        print(f"[{i+1:2d}/{len(all_blog_urls)}] ERROR: {slug[:50]} - {str(e)[:50]}", flush=True)
        results.append({'url': url, 'slug': slug, 'status': 'ERROR', 'words': 0, 'flags': str(e)[:50]})

# Summary
print("\n========================================", flush=True)
print("           TOM TAT", flush=True)
print("========================================", flush=True)

indexed = [r for r in results if r['status'] == 'INDEXED']
not_indexed = [r for r in results if r['status'] == 'NOT_INDEXED']
short = [r for r in results if r.get('words', 0) < 300 and r['status'] == 'NOT_INDEXED']
noindex = [r for r in results if r.get('noindex')]

print(f"Indexed: {len(indexed)}", flush=True)
print(f"Not indexed: {len(not_indexed)}", flush=True)
print(f"Short (<300w) trong not_indexed: {len(short)}", flush=True)
print(f"Noindex tags: {len(noindex)}", flush=True)

if short:
    print(f"\n--- BAI NGAN (<300 tu) CAN FIX ---", flush=True)
    for r in short:
        print(f"  {r['words']:4d}w | {r['slug'][:60]}", flush=True)

if noindex:
    print(f"\n--- BAI CO NOINDEX TAG ---", flush=True)
    for r in noindex:
        print(f"  {r['url']}", flush=True)
