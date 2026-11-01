# -*- coding: utf-8 -*-
"""URL Inspection API cho cac anh /img/blog/* (readonly token, khong can browser)."""
import json, os, sys, io
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from google.oauth2.credentials import Credentials  # noqa: E402
from google.auth.transport.requests import Request  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = os.path.join(HERE, "..", ".gsc-oauth", "token.json")
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
SITE = "https://ketoanthuetada.com/"
API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"

urls = ["https://ketoanthuetada.com/img/blog/" + f for f in [
    "dv-bao-hiem-xa-hoi.jpg", "dv-hoan-thue-tncn.jpg", "dv-ke-khai-thue.jpg",
    "dv-ke-toan-tron-goi.jpg", "dv-kiem-toan.jpg", "dv-phan-mem.jpg",
    "dv-that-nghiep.jpg", "dv-thay-doi-thong-tin.jpg", "dv-tu-van.jpg",
    "etax-mobile-menu-hkd.png", "giai-the-trang-thai-06.png", "giam30-mau01.png",
    "giam30-mau02.png", "giam30-mau03.png", "mau-01-cnkd-huong-dan.png",
    "mau-01-dktd-hddt.png", "mau-01-tkn-cnkd.png", "mau-02-qtt-hkd.png",
    "mau-tkn-mien-thue.png", "nd-398-2026-giam-thue-tncn-mau-01.png",
    "nd-398-2026-mau-03-dieudhinh-vuot-10-ty.png", "to-phat-24-trieu-qd.png",
    "tt91-phu-luc-iii.png",
]]


def main():
    creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not creds.valid:
        creds.refresh(Request())
        with open(TOKEN, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    out = []
    for u in urls:
        body = json.dumps({"inspectionUrl": u, "siteUrl": SITE}).encode()
        req = urllib.request.Request(API, data=body, headers={
            "Authorization": "Bearer " + creds.token, "Content-Type": "application/json"})
        try:
            resp = json.load(urllib.request.urlopen(req, timeout=60))
            idx = resp.get("inspectionResult", {}).get("indexStatusResult", {})
            img = idx.get("imageResults") or {}
            out.append({
                "f": u.rsplit("/", 1)[-1],
                "verdict": idx.get("verdict") or idx.get("indexingState"),
                "state": idx.get("indexingState"),
                "image_verdict": img.get("verdict"),
                "image_type": img.get("imageType"),
                "issues": idx.get("sitemapCanonical") or (idx.get("issues") or []),
                "crawl": idx.get("crawledAs") or "",
            })
        except Exception as e:  # noqa: BLE001
            out.append({"f": u.rsplit("/", 1)[-1], "verdict": "API_ERR", "state": repr(e)[:80]})
        for o in out[-1:]:
            print(json.dumps(o, ensure_ascii=False))
    print("TONG:", len(out))


if __name__ == "__main__":
    main()
