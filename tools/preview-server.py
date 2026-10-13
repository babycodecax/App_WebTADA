import os
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = r"D:\Projects\App_WebTADA\backend"
UPSTREAM = "https://ketoanthuetada.com"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?", 1)[0]
        if p.startswith("/api/"):
            try:
                with urllib.request.urlopen(UPSTREAM + self.path, timeout=20) as r:
                    body = r.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_error(502, str(e)[:100])
            return
        return super().do_GET()

    def translate_path(self, path):
        p = path.split("?", 1)[0].rstrip("/") or "/"
        if p in ("/", "/index.html"):
            return os.path.join(BASE, "static", "index.html")
        if p == "/blog":
            return os.path.join(BASE, "static", "blog.html")
        if p == "/thu-vien":
            return os.path.join(BASE, "static", "library.html")
        if p == "/tinh-thue":
            return os.path.join(BASE, "static", "tinh-thue.html")
        if p == "/audit":
            return os.path.join(BASE, "static", "audit.html")
        if p.startswith("/static/"):
            return os.path.join(BASE, p.lstrip("/").replace("/", os.sep))
        return os.path.join(BASE, "static", p.lstrip("/").replace("/", os.sep))

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", 8903), Handler).serve_forever()
