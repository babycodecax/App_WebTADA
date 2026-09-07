#!/usr/bin/env python3
"""Upload a single blog post markdown file to Supabase blog_posts table.

Usage:
    python tools/update-single-blog.py <slug> <filepath>

The script reads the markdown file, strips the frontmatter (keeping only the body),
and PATCHes the 'content' column for the row matching <slug>.
"""

import sys
import json
import os
import urllib.request
import urllib.error


def load_env(env_path):
    """Load key=value pairs from a .env file."""
    env = {}
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def strip_frontmatter(content):
    """Remove YAML frontmatter from markdown content, returning only the body."""
    parts = content.split("---", 2)
    if len(parts) >= 3:
        return parts[2].strip()
    return content


def upload(slug, filepath):
    """PATCH the blog_posts row matching slug with the markdown body."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    body = strip_frontmatter(content)

    env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
    env = load_env(env_path)

    supabase_url = env["SUPABASE_URL"]
    supabase_key = env["SUPABASE_KEY"]

    url = f"{supabase_url}/rest/v1/blog_posts?slug=eq.{slug}"
    payload = json.dumps({"content": body}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )

    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read().decode("utf-8"))
        if isinstance(result, list) and len(result) > 0:
            print(f"OK: {slug} ({len(body)} chars, updated {len(result)} row(s))")
        else:
            print(f"WARNING: {slug} - 0 rows updated (slug may not exist in Supabase)")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        print(f"ERROR: {slug} - HTTP {e.code}: {body_text}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python tools/update-single-blog.py <slug> <filepath>")
        sys.exit(1)

    slug = sys.argv[1]
    filepath = sys.argv[2]

    if not os.path.isfile(filepath):
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    upload(slug, filepath)
