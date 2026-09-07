import json, os, urllib.request

env_path = 'D:/CodeApp/Projects/App_WebTADA/backend/.env'
env = {}
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

outdir = 'D:/CodeApp/Projects/App_WebTADA/tools/blog-content/old-posts'
ok = 0
fail = 0
for fname in sorted(os.listdir(outdir)):
    if not fname.endswith('.md'): continue
    slug = fname.replace('.md','')
    filepath = os.path.join(outdir, fname)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    parts = content.split('---', 2)
    body = parts[2].strip() if len(parts) >= 3 else content
    url = env['SUPABASE_URL'] + '/rest/v1/blog_posts?slug=eq.' + slug
    try:
        req = urllib.request.Request(url,
            data=json.dumps({'content': body}).encode(),
            headers={
                'Content-Type': 'application/json',
                'apikey': env['SUPABASE_KEY'],
                'Authorization': 'Bearer ' + env['SUPABASE_KEY'],
                'Prefer': 'return=minimal'
            },
            method='PATCH')
        urllib.request.urlopen(req)
        ok += 1
        print('OK: ' + slug[:60])
    except Exception as e:
        fail += 1
        print('FAIL: ' + slug[:60] + ' - ' + str(e))
print('Done: ' + str(ok) + ' OK, ' + str(fail) + ' FAIL')
