"""Add internal links to EXISTING 'Xem thêm' sections in 4 indexed posts."""
import urllib.request, json, os, sys, io, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

env_path = os.path.join(os.path.dirname(__file__), '..', 'api', '.env.local')
with open(env_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
HEADERS = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}

NOT_INDEXED = {
    'chuyen-trang-thai-ma-so-thue-tu-03-sang-06': 'Chuyển trạng thái MST từ 03 sang 06',
    'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026': 'Nộp nội quỹ lao động 2026',
    'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026': 'Đăng ký HĐ điện tử cho HKD 2026',
    'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue': 'Hợp thức hóa chi phí tiền lương',
    'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026': 'Kinh doanh TMĐT xuất HĐ đúng chuẩn',
    'hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026': 'HĐ người tiêu dùng hiểu đúng',
    'hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai': 'HĐ một đằng bank một nẻo',
    'lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly': 'Lót tay_tip bằng tiền công ty',
    'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026': 'Xử lý rủi ro HĐ N06',
    'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026': 'Gỡ lệnh tạm hoãn xuất cảnh do nợ thuế',
}

# Source posts → which not-indexed slugs to ADD to their existing "Xem thêm" section
LINK_ADDITIONS = {
    'thue-hkd-2026-tong-hop-day-du': [
        'chuyen-trang-thai-ma-so-thue-tu-03-sang-06',
        'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026',
    ],
    'hoa-don-dien-tu-2026-tong-hop-quy-dinh-moi': [
        'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026',
        'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026',
        'hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026',
    ],
    'thue-tncn-hkd-2026-tong-hop-huong-dan': [
        'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026',
        'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue',
    ],
    'chatbot-tu-van-thue-ai-2026-tong-hop': [
        'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026',
    ],
}

def supabase_get(table, params):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))

def supabase_update(table, id, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id}"
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='PATCH')
    urllib.request.urlopen(req, timeout=15)
    return True

print("=== FETCH POSTS ===", flush=True)
posts = supabase_get('blog_posts', 'select=id,slug,content&status=eq.published&limit=100')
slug_to_post = {p['slug']: p for p in posts}

print("=== ADDING LINKS ===", flush=True)
updated = 0

for source_slug, targets in LINK_ADDITIONS.items():
    post = slug_to_post.get(source_slug)
    if not post:
        print(f"SKIP: {source_slug} not found", flush=True)
        continue

    content = post['content']

    # Check which targets are already linked
    already_linked = []
    new_targets = []
    for t_slug in targets:
        if t_slug in content:
            already_linked.append(t_slug)
        else:
            new_targets.append(t_slug)

    if not new_targets:
        print(f"SKIP: {source_slug} — all targets already linked", flush=True)
        continue

    # Build new links markdown
    new_links = ''
    for t_slug in new_targets:
        title = NOT_INDEXED[t_slug]
        new_links += f'\n*Xem thêm: [{title}](/blog/{t_slug})*'

    # Find the "Xem thêm" section and append after it
    # Pattern: *Xem thêm: [...](/blog/...)*
    lines = content.split('\n')
    insert_idx = None
    for i, line in enumerate(lines):
        if '*Xem thêm:' in line or '*Xem thêm:' in line:
            insert_idx = i

    if insert_idx is not None:
        # Insert after the last "Xem thêm" line
        lines.insert(insert_idx + 1, new_links)
        new_content = '\n'.join(lines)
    else:
        # Fallback: append at end
        new_content = content.rstrip() + '\n\n---\n\n## 📚 Đọc thêm\n' + new_links + '\n'

    try:
        supabase_update('blog_posts', post['id'], {'content': new_content})
        updated += 1
        print(f"UPDATED: {source_slug} (+{len(new_targets)} new links, {len(already_linked)} already linked)", flush=True)
    except Exception as e:
        print(f"FAILED: {source_slug}: {e}", flush=True)

print(f"\n=== HOAN THANH ===", flush=True)
print(f"Updated: {updated}/{len(LINK_ADDITIONS)} posts", flush=True)
