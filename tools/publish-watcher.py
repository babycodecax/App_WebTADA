"""publish-watcher.py — Hook publish-driven cho ketoanthuetada.com.

Chay ngam (Startup VBS), POLL moi 10 phu:
1. Query DB blog_posts moi nhat (limit 10).
2. Bai co published_at trong PREFIX_MIN phut va chua xu ly (state) -> notify:
   - IndexNow POST 1 URL (15 search engines, nhan async ngay)
   - Bing SubmitUrl API 1 URL (quota dong bo voi index-runner)
3. State: tools/publish-watcher-state.json {slug: {i: iso, b: isonull}}
   b=null -> thu lai Bing chu ky sau cho den khi OK; i da thi bo qua.

GSC khong o day (can Chrome UI) — runner chay luc mo may da uu tien bai
moi nhat (posts desc) trong chu ky 7 ngay.
"""
import datetime
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(HERE, "publish-watcher-state.json")
LOG_FILE = os.path.join(HERE, "publish-watcher.log")
KEY_FILE = os.path.join(HERE, ".indexnow-key.txt")
ENV_FILE = os.path.join(os.path.dirname(HERE), "api", ".env")
SITE = "https://ketoanthuetada.com"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
SUPABASE_HOST = "https://zpxfhxchvoqcfcskxcez.supabase.co"
POLL_SEC = 600
RECENT_MIN = 25
DB_LIMIT = 10


def log(msg):
    line = "[%s] %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def read_env(path):
    out = {}
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip().strip('"').strip("'")
    except Exception as e:
        log("api/.env doc LOI: %s" % re.sub(r"(KEY|key)=[^&\s'\"]+", r"\1=REDACTED", str(e)))
    return out


def fetch_recent_posts():
    env = read_env(ENV_FILE)
    host = env.get("SUPABASE_HOST", SUPABASE_HOST).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        log("DB bo qua: thieu SUPABASE_SERVICE_ROLE_KEY")
        return []
    url = host + "/rest/v1/blog_posts?select=slug,published_at&order=published_at.desc&limit=%d" % DB_LIMIT
    try:
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
        return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
    except Exception as e:
        log("DB LOI: %s" % e)
        return []


def parse_dt(s):
    try:
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return None


def indexnow_submit(path):
    try:
        with open(KEY_FILE, "r", encoding="utf-8-sig") as f:
            key = f.read().strip()
    except Exception as e:
        log("IndexNow doc key LOI: %s" % e)
        return False
    body = json.dumps({
        "host": "ketoanthuetada.com",
        "key": key,
        "urlList": [SITE + path],
    }).encode("utf-8")
    req = urllib.request.Request(
        INDEXNOW_ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        code = urllib.request.urlopen(req, timeout=30)
        log("IndexNow %s -> HTTP %d" % (path, code.status))
        return True
    except Exception as e:
        log("IndexNow %s LOI: %s" % (path, e))
        return False


def bing_submit(path):
    try:
        p = subprocess.run(
            [sys.executable, os.path.join(HERE, "bing-submit.py"), "--url", path],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=60,
        )
        out = (p.stdout or "").strip().splitlines()
        for ln in (out[-3:] or [""]):
            log("bing | %s" % ln)
        ok = (p.returncode == 0) and any("OK" in ln for ln in out)
        log("Bing %s -> exit=%d %s" % (path, p.returncode, "OK" if ok else "PENDING-RETRY"))
        return ok
    except Exception as e:
        log("Bing %s LOI: %s" % (path, e))
        return False


def might_be_new(published_at, now):
    dt = parse_dt(published_at)
    if not dt:
        return False
    age_min = (now - dt).total_seconds() / 60.0
    return 0 <= age_min <= RECENT_MIN


def _cycle(state):
    """1 chu ky poll — moi loi deu bao hiem (throw len main de wrap)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    posts = fetch_recent_posts()
    changed = False
    for it in posts:
        slug = it.get("slug") or ""
        pub = it.get("published_at") or ""
        if not slug or not might_be_new(pub, now):
            continue
        rec = state.get(slug)
        if isinstance(rec, dict) and rec.get("i"):
            # da indexnow roi; chi retry Bing khi b rong
            if not rec.get("b"):
                if bing_submit("/blog/" + slug):
                    rec["b"] = datetime.date.today().isoformat()
                    changed = True
            continue
        log("BAI MOI: %s (published_at=%s)" % (slug, pub))
        i_ok = indexnow_submit("/blog/" + slug)
        b_ok = bing_submit("/blog/" + slug) if i_ok else False
        state[slug] = {
            "i": datetime.datetime.now(datetime.timezone.utc).isoformat() if i_ok else "",
            "b": datetime.date.today().isoformat() if b_ok else "",
        }
        changed = True
    return changed


def main():
    log("publish-watcher khoi dong (poll=%ds, window=%d phut)" % (POLL_SEC, RECENT_MIN))
    state = load_state()
    while True:
        try:
            changed = _cycle(state)
            if changed:
                save_state(state)
        except Exception as e:
            log("CHU KY LOI (tiep tuc %ds sau): %s" % (POLL_SEC, e))
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
