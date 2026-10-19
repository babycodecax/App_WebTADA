# -*- coding: utf-8 -*-
import sys, io, urllib.request, json, re, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

env = dict(l.strip().split('=', 1) for l in open(r'D:\Projects\App_WebTADA\api\.env', encoding='utf-8') if '=' in l and not l.strip().startswith('#'))
k = env['SUPABASE_SERVICE_ROLE_KEY']
SB = 'https://zpxfhxchvoqcfcskxcez.supabase.co'
H = {'apikey': k, 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json'}

req = urllib.request.Request(SB + '/rest/v1/blog_posts?select=id,slug,title,summary,content&status=eq.published&order=published_at.desc&limit=1000', headers=H)
posts = json.loads(urllib.request.urlopen(req, timeout=90).read())
print('posts:', len(posts))

STOP = set('''của và cho với những khi là có có được không phải trên dưới từ 这 trong vào ra đến tại về theo nêu đó này này nhất hơn một hai ba chữ cả nếu thì nhưng mà nên cái gì vậy sao nào này về trước sau ngày tháng năm mức số tiền thuế hộ doanh nghiệp cá nhân kinh doanh'''.split())

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9\s]', ' ', s)

def toks(s):
    return [w for w in norm(s).split() if len(w) >= 3 and w not in STOP]

vec = {}
for p in posts:
    vec[p['slug']] = set(toks(p['title']) + toks(p['summary']) + toks((p['content'] or '')[:1500]))

MARKS = ['---\n\n> **Căn cứ pháp lý:**', '## Căn cứ pháp lý']
patched = 0
for p in posts:
    c = p['content'] or ''
    if 'Xem thêm' in c:
        continue
    me = vec[p['slug']]
    scored = []
    for q in posts:
        if q['slug'] == p['slug']:
            continue
        ov = len(me & vec[q['slug']])
        if ov >= 2:
            scored.append((ov, q['slug'], q['title']))
    scored.sort(reverse=True)
    top = scored[:3]
    if len(top) < 2:
        continue
    links = '\n'.join('- [' + t + '](https://ketoanthuetada.com/blog/' + s + ')' for _, s, t in top)
    ins = '\n## Xem thêm\n\n' + links + '\n\n'
    mark = next((m for m in MARKS if m in c), None)
    if mark:
        c2 = c.replace(mark, ins + mark, 1)
    else:
        idx = c.rfind('\n---\n')
        if idx < 0:
            continue
        c2 = c[:idx] + ins + c[idx:]
    req = urllib.request.Request(SB + '/rest/v1/blog_posts?id=eq.' + p['id'], method='PATCH',
                                 data=json.dumps({'content': c2}).encode(), headers=H)
    urllib.request.urlopen(req, timeout=60)
    patched += 1
    print('PATCH:', p['slug'][:40], '| links:', [s for _, s, _ in top])
print('patched total:', patched)
