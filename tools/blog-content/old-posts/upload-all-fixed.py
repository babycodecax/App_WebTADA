import json, os, urllib.request
env = {}
with open('D:/CodeApp/Projects/App_WebTADA/backend/.env', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
outdir = 'D:/CodeApp/Projects/App_WebTADA/tools/blog-content/old-posts'
ok = fail = 0
for fname in os.listdir(outdir):
    if not fname.endswith('.md') or fname.endswith('.py'): continue
    slug = fname.replace('.md','')
    fp = os.path.join(outdir, fname)
    with open(fp, 'r', encoding='utf-8') as f: c = f.read()
    parts = c.split('---', 2)
    body = parts[2].strip() if len(parts) >= 3 else c
    url = env['SUPABASE_URL'] + '/rest/v1/blog_posts?slug=eq.' + slug
    try:
        req = urllib.request.Request(url, data=json.dumps({'content': body}).encode(), headers={'Content-Type':'application/json','apikey':env['SUPABASE_KEY'],'Authorization':'Bearer '+env['SUPABASE_KEY'],'Prefer':'return=minimal'}, method='PATCH')
        urllib.request.urlopen(req)
        ok += 1
        print('OK: ' + slug[:50])
    except Exception as e:
        fail += 1
        print('FAIL: ' + slug[:50] + ' ' + str(e)[:50])
print(f'Done: {ok} OK, {fail} FAIL')