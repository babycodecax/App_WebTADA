# -*- coding: utf-8 -*-
"""preview-landing.py — Serve api/public voi rewrite /static/* (mo phong Vercel).

Dung: python tools/preview-landing.py [port]   (mac dinh 8911)
Tham phan: http://localhost:8911/
"""
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api", "public")
STATIC_PREFIX = "/static/"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        if path.startswith(STATIC_PREFIX):
            path = path[len(STATIC_PREFIX) - 1:]  # /static/x -> /x
            q = path.find("?")
            if q != -1:
                path = path[:q]
        return super().translate_path(path.split("?")[0])


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8911
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
