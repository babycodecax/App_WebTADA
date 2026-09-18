"""
Kiem tra ket noi Google Search Console API (OAuth desktop flow).

Cach dung:
  python tools/gsc-api-check.py

Lan dau: browser mo ra -> ban chon tai khoan Google (Owner site)
-> Accept. Token luu vao tools/.gsc-oauth/token.json (da gitignore).
Lan sau: chay thang, khong can login lai.

Lam duoc: liet ke site, sitemap, tong clicks/impressions 7 ngay.
KHONG lam duoc: request indexing (API khong co endpoint nay).
"""

import datetime
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

HERE = os.path.dirname(os.path.abspath(__file__))
OAUTH_DIR = os.path.join(HERE, ".gsc-oauth")
CLIENT_SECRET = os.path.join(OAUTH_DIR, "client_secret.json")
TOKEN_FILE = os.path.join(OAUTH_DIR, "token.json")
REPORT_DIR = os.path.join(HERE, "gsc-reports")

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
SITE = "https://ketoanthuetada.com/"


def get_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except (ValueError, KeyError):
            os.remove(TOKEN_FILE)
            creds = None
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                os.remove(TOKEN_FILE)
                creds = None
        else:
            if not os.path.exists(CLIENT_SECRET):
                print("Thieu file: " + CLIENT_SECRET)
                return None
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        print("Da luu token: " + TOKEN_FILE)
    return build("searchconsole", "v1", credentials=creds)


def main():
    if not os.path.exists(REPORT_DIR):
        os.makedirs(REPORT_DIR)
    svc = get_service()
    if svc is None:
        return

    sites = svc.sites().list().execute().get("siteEntry", [])
    print("Sites: %d" % len(sites))

    def norm(u):
        return (u or "").strip().rstrip("/").lower()

    want = {norm(SITE), "sc-domain:ketoanthuetada.com"}
    mine = [s for s in sites if norm(s.get("siteUrl")) in want]
    for s in sites:
        print(" - %s [%s]" % (s.get("siteUrl"), s.get("permissionLevel")))
    if not mine:
        print("KHONG thay site %s (check quyen Owner)." % SITE)
        return

    url = mine[0]["siteUrl"]
    sm = svc.sitemaps().list(siteUrl=url).execute().get("sitemap", [])
    print("Sitemaps: %d" % len(sm))

    end = datetime.date.today() - datetime.timedelta(days=2)
    start = end - datetime.timedelta(days=7)
    q = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "dimensions": ["date"],
        "rowLimit": 10,
    }
    rows = svc.searchanalytics().query(siteUrl=url, body=q).execute().get("rows", [])
    clicks = sum(r.get("clicks", 0) for r in rows)
    impr = sum(r.get("impressions", 0) for r in rows)
    print("7 ngay: clicks=%d impressions=%d" % (clicks, impr))

    report = {
        "site": url,
        "sitemap_count": len(sm),
        "last_7d": {"clicks": clicks, "impressions": impr},
    }
    out = os.path.join(REPORT_DIR, "gsc-api-check.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("OK. Report: " + out)


if __name__ == "__main__":
    main()
