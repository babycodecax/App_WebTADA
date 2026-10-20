import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(HERE, ".bing-api-key.txt")
SITE = "https://ketoanthuetada.com"
API_BASE = "https://ssl.bing.com/webmaster/api.svc/json/"
UA = "tada-bing-submit/1.0"


def read_key():
    with open(KEY_FILE, "r", encoding="utf-8-sig") as f:
        key = f.read().strip()
    if not key:
        raise RuntimeError("Key file trong: " + KEY_FILE)
    return key


def api_get(path_qs, key):
    url = API_BASE + path_qs + ("&" if "?" in path_qs else "?") + "apikey=" + key
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8")[:200]
        except Exception:
            pass
        raise RuntimeError("HTTP %d %s" % (e.code, detail))


def api_post(path_qs, key, body):
    url = API_BASE + path_qs + ("&" if "?" in path_qs else "?") + "apikey=" + key
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"User-Agent": UA, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8")[:200]
        except Exception:
            pass
        raise RuntimeError("HTTP %d %s" % (e.code, detail))


def main():
    ap = argparse.ArgumentParser(description="Bing Webmaster URL Submission API")
    ap.add_argument("--check", action="store_true", help="Xem quota submit")
    ap.add_argument("--url", help="Submit 1 URL duoi dang /path")
    ap.add_argument("--urls-file", help="Submit nhieu URL tu file (moi dong 1 /path)")
    ap.add_argument("--limit", type=int, default=1000)
    args = ap.parse_args()

    try:
        key = read_key()
    except Exception as e:
        print("[ERR] Doc key loi: %s" % e)
        sys.exit(2)

    try:
        if args.check:
            qs = "GetUrlSubmissionQuota?siteUrl=" + urllib.parse.quote(SITE, safe="")
            print("Quota:", json.dumps(api_get(qs, key), ensure_ascii=False))
            return
        if args.url:
            if not args.url.startswith("/"):
                print("[ERR] --url phai cheo dang /path,VD: /blog/ten-bai")
                sys.exit(2)
            res = api_post("SubmitUrl", key, {"siteUrl": SITE, "url": SITE + args.url})
            print("Submit 1 URL OK:", json.dumps(res, ensure_ascii=False))
            return
        if args.urls_file:
            path = args.urls_file
            if not os.path.isabs(path):
                cand = [os.path.join(HERE, path), os.path.join(os.path.dirname(HERE), path)]
                path = next((c for c in cand if os.path.exists(c)), path)
            with open(path, "r", encoding="utf-8-sig") as f:
                urls = [l.strip() for l in f if l.strip().startswith("/")]
            urls = urls[: args.limit]
            if not urls:
                print("[ERR] File khong co URL hop le bat dau bang /")
                sys.exit(2)
            res = api_post(
                "SubmitUrlBatch",
                key,
                {"siteUrl": SITE, "urlList": [SITE + u for u in urls]},
            )
            print("Submit %d URL OK: %s" % (len(urls), json.dumps(res, ensure_ascii=False)))
            return
        ap.print_help()
    except Exception as e:
        print("[ERR] " + str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
