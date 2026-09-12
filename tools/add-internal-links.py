"""
Add internal links to 5 high-authority indexed blog posts → link to 10 not-indexed posts.
Uses Supabase REST API directly (faster than going through Next.js API).
"""
import urllib.request
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Load env
env_path = os.path.join(os.path.dirname(__file__), '..', 'api', '.env.local')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', os.environ.get('SUPABASE_ANON_KEY', ''))

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_KEY in .env.local")
    sys.exit(1)

print(f"Supabase URL: {SUPABASE_URL[:30]}...", flush=True)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

# 10 not-indexed slugs
NOT_INDEXED = [
    'chuyen-trang-thai-ma-so-thue-tu-03-sang-06',
    'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026',
    'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026',
    'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue',
    'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026',
    'hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026',
    'hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai',
    'lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly',
    'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026',
    'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026',
]

# 5 high-authority indexed posts to add links INTO
LINK_SOURCE_POSTS = [
    'thue-hkd-2026-tong-hop-day-du',
    'hoa-don-dien-tu-2026-tong-hop-quy-dinh-moi',
    'thue-tncn-hkd-2026-tong-hop-huong-dan',
    'chatbot-tu-van-thue-ai-2026-tong-hop',
    'giam-30-thue-tncn-2026-ai-duoc-huong',
]

# Map: source slug → which not-indexed slugs to link (by topic relevance)
LINK_MAP = {
    'thue-hkd-2026-tong-hop-day-du': [
        'chuyen-trang-thai-ma-so-thue-tu-03-sang-06',
        'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026',
        'lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly',
    ],
    'hoa-don-dien-tu-2026-tong-hop-quy-dinh-moi': [
        'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026',
        'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026',
        'hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026',
        'hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai',
    ],
    'thue-tncn-hkd-2026-tong-hop-huong-dan': [
        'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026',
        'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue',
    ],
    'chatbot-tu-van-thue-ai-2026-tong-hop': [
        'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026',
    ],
    'giam-30-thue-tncn-2026-ai-duoc-huong': [
        'chuyen-trang-thai-ma-so-thue-tu-03-sang-06',
    ],
}

# Title map for display
TITLE_MAP = {
    'chuyen-trang-thai-ma-so-thue-tu-03-sang-06': 'Chuyển trạng thái MST từ 03 sang 06',
    'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026': 'Hướng dẫn nộp nội quỹ lao động 2026',
    'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026': 'Đăng ký HĐ điện tử cho HKD 2026',
    'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue': 'Hợp thức hóa chi phí tiền lương',
    'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026': 'Kinh doanh TMĐT xuất HĐ đúng chuẩn',
    'hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026': 'HĐ người tiêu dùng hiểu đúng',
    'hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai': 'HĐ một đằng bank một nẻo',
    'lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly': 'Lót tay_tip bằng tiền công ty',
    'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026': 'Xử lý rủi ro HĐ N06',
    'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026': 'Gỡ lệnh tạm hoãn xuất cảnh do nợ thuế',
}


def supabase_get(table, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))


def supabase_update(table, id, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id}"
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='PATCH')
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception as e:
        print(f"  ERROR updating: {e}")
        return False


# Step1: Fetch all blog posts
print("\n=== FETCH BLOG POSTS ===", flush=True)
posts = supabase_get('blog_posts', 'select=id,slug,title,content&status=eq.published&limit=100')
print(f"Found {len(posts)} published posts", flush=True)

slug_to_post = {p['slug']: p for p in posts}

# Step2: For each source post, add "Xem thêm" section
print("\n=== ADDING INTERNAL LINKS ===", flush=True)
updated_count = 0

for source_slug, target_slugs in LINK_MAP.items():
    post = slug_to_post.get(source_slug)
    if not post:
        print(f"SKIP: {source_slug} not found", flush=True)
        continue

    content = post.get('content', '')

    # Check if "Xem thêm" section already exists
    if 'Xem thêm' in content or '## Đọc thêm' in content or '## Liên quan' in content:
        print(f"SKIP: {source_slug} already has related section", flush=True)
        continue

    # Build "Xem thêm" section
    links_md = '\n\n---\n\n## 📚 Đọc thêm\n\n'
    for target_slug in target_slugs:
        title = TITLE_MAP.get(target_slug, target_slug)
        links_md += f'- [{title}](/blog/{target_slug})\n'
    links_md += '\n'

    new_content = content.rstrip() + '\n' + links_md

    # Update via Supabase
    success = supabase_update('blog_posts', post['id'], {'content': new_content})
    if success:
        updated_count += 1
        print(f"UPDATED: {source_slug} (+{len(target_slugs)} links)", flush=True)
    else:
        print(f"FAILED: {source_slug}", flush=True)

print(f"\n=== HOAN THANH ===", flush=True)
print(f"Updated: {updated_count}/{len(LINK_SOURCE_POSTS)} posts", flush=True)
print(f"Total internal links added: {sum(len(v) for v in LINK_MAP.values())}", flush=True)
