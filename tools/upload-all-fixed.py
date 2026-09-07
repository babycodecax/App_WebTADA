"""
Upload all fixed old blog posts to Supabase.
Reads frontmatter + body from each .md file and PATCHes the blog_posts table.
"""
import json
import os
import urllib.request
import sys

env_path = "D:/CodeApp/Projects/App_WebTADA/backend/.env"
outdir = "D:/CodeApp/Projects/App_WebTADA/tools/blog-content/old-posts"

# Load .env
env = {}
with open(env_path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["SUPABASE_URL"]
SUPABASE_KEY = env["SUPABASE_KEY"]

ok = 0
fail = 0
skipped = 0

for fname in sorted(os.listdir(outdir)):
    if not fname.endswith(".md"):
        continue
    slug = fname.replace(".md", "")
    filepath = os.path.join(outdir, fname)

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Split frontmatter and body
    parts = content.split("---", 2)
    if len(parts) >= 3:
        body = parts[2].strip()
    else:
        body = content

    # Extract title from frontmatter for the update
    frontmatter = parts[1] if len(parts) >= 2 else ""
    title = ""
    summary = ""
    for fm_line in frontmatter.split("\n"):
        if fm_line.strip().startswith("title:"):
            title = fm_line.split(":", 1)[1].strip().strip('"')
        if fm_line.strip().startswith("summary:"):
            summary = fm_line.split(":", 1)[1].strip().strip('"')

    url = SUPABASE_URL + "/rest/v1/blog_posts?slug=eq." + slug
    payload = {
        "content": body,
    }
    if title:
        payload["title"] = title
    if summary:
        payload["summary"] = summary

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": "Bearer " + SUPABASE_KEY,
                "Prefer": "return=minimal",
            },
            method="PATCH",
        )
        resp = urllib.request.urlopen(req)
        ok += 1
        print(f"OK: {slug[:70]}")
    except Exception as e:
        fail += 1
        print(f"FAIL: {slug[:70]} - {e}")

print(f"\nDone: {ok} OK, {fail} FAIL")
