"""index-runner.py — Runner tu dong_index cho ketoanthuetada.com.

Moi lan chay (danh cho Task Scheduler ONLOGON, va chay tay cu duoc):
1. Lay master list: sitemap live + DB blog_posts moi (<=60 ngay).
2. GSC: pending = URL chua "request index" trong 7 ngay qua state;
   cap = 10 - used_today (doc tat ca report gsc-pump-*.json trong ngay).
   Chay tools/gsc-index.py --request. Trang thai thanh cong -> ghi state.
3. Bing: pending = URL chua submit trong 14 ngay qua state;
   cap = DailyQuota con lai (API GetUrlSubmissionQuota).
   Chay tools/bing-submit.py SubmitUrlBatch. OK -> ghi state.
4. State luu tools/index-state.json; log ghi tools/index-runner.log.

Ket qua chi de report: quotas & pending counts.
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
REPORT_DIR = os.path.join(HERE, "gsc-index-reports")
STATE_FILE = os.path.join(HERE, "index-state.json")
LOG_FILE = os.path.join(HERE, "index-runner.log")
LOCK_FILE = os.path.join(HERE, ".index-runner.lock")
ENV_FILE = os.path.join(os.path.dirname(HERE), "api", ".env")
SITE = "https://ketoanthuetada.com"
SUPABASE_HOST = "https://zpxfhxchvoqcfcskxcez.supabase.co"
GSC_DAILY_CAP = 10
GSC_REATTEMPT_DAYS = 7
BING_REATTEMPT_DAYS = 14
DB_RECENT_DAYS = 60
STATIC_PRIORITY = ["/tinh-thue", "/", "/blog", "/thu-vien"]


def log(msg):
    line = "[%s] %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    # Khong bao gio ghi API key ra log
    line = re.sub(r"apikey=[^&\s'\"]+", "apikey=REDACTED", line)
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


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


def fetch_sitemap_urls():
    try:
        req = urllib.request.Request(
            SITE + "/sitemap.xml", headers={"User-Agent": "tada-index-runner/1.0"}
        )
        xml = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
        urls = [u.rstrip("/") for u in re.findall(r"<loc>([^<]+)</loc>", xml)]
        urls = [u.replace(SITE, "") for u in urls if u.startswith(SITE)]
        return urls
    except Exception as e:
        log("sitemap LOI: %s" % e)
        return []


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
        log("api/.env doc LOI: %s" % e)
    return out


def fetch_db_posts():
    env = read_env(ENV_FILE)
    host = env.get("SUPABASE_HOST", SUPABASE_HOST).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not host or not key:
        log("DB bo qua: thieu SUPABASE_HOST/key trong api/.env")
        return []
    since = (datetime.date.today() - datetime.timedelta(days=DB_RECENT_DAYS)).isoformat()
    url = (
        host.rstrip("/") + "/rest/v1/blog_posts"
        + "?select=slug,published_at"
        + "&published_at=gte." + since + "T00:00:00"
        + "&order=published_at.desc&limit=200"
    )
    try:
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
        data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        return ["/blog/" + it["slug"] for it in data if it.get("slug")]
    except Exception as e:
        log("DB LOI: %s" % e)
        return []


def days_since(date_str, today):
    try:
        return (today - datetime.date.fromisoformat(date_str[:10])).days
    except Exception:
        return 9999


def gsc_used_today(report_dir, today):
    used = 0
    try:
        names = [n for n in os.listdir(report_dir) if n.startswith("gsc-pump-") and n.endswith(".json")]
    except Exception:
        return used
    for n in names:
        try:
            with open(os.path.join(report_dir, n), "r", encoding="utf-8") as f:
                r = json.load(f)
        except Exception:
            continue
        if (r.get("mode") == "request") and (r.get("started", "")[:10] == today.isoformat()):
            used += int(r.get("requested", 0) or 0)
    return used


def gsc_requests_ok(status):
    return status in ("submitted", "clicked-no-banner", "clicked-no-confirm")


def try_unlock_stale_lock():
    if os.path.exists(LOCK_FILE):
        try:
            age = time.time() - os.path.getmtime(LOCK_FILE)
        except Exception:
            age = 0
        if age > 2 * 3600:
            log("Lock cu hon 2h - xoa lock treo")
            try:
                os.remove(LOCK_FILE)
            except Exception:
                pass
            return True
        return False
    return True


def run_tool(args, log):
    t0 = time.time()
    log("RUN: " + " ".join(os.path.basename(a) if os.path.sep in str(a) else str(a) for a in args))
    try:
        p = subprocess.run(
            [sys.executable] + args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3600,
        )
    except Exception as e:
        log("  subprocess LOI: %s" % e)
        return 1
    log("  exit=%d in %.0fs" % (p.returncode, time.time() - t0))
    tail = (p.stdout or "").strip().splitlines()[-15:]
    for ln in tail:
        log("  | " + ln)
    if (p.stderr or "").strip():
        for ln in (p.stderr.strip().splitlines()[-5:]):
            log("  !! " + ln)
    return p.returncode


def main():
    t0 = time.time()
    if not try_unlock_stale_lock():
        log("Runner khac dang chay - exit.")
        return
    try:
        with open(LOCK_FILE, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    try:
        today = datetime.date.today()
        os.makedirs(REPORT_DIR, exist_ok=True)
        log("=== index-runner bat dau ===")

        sitemap = fetch_sitemap_urls()
        posts = fetch_db_posts()
        state = load_state()
        ga = state.get("gsc", {})
        ba = state.get("bing", {})

        # Backfill state tu moi report lich su trong cua so reattempt
        # ( tranh re-request nham cac URL da xu ly truoc khi co state)
        try:
            hist = [n for n in os.listdir(REPORT_DIR) if n.startswith("gsc-pump-") and n.endswith(".json")]
        except Exception:
            hist = []
        bf = 0
        for n in hist:
            try:
                with open(os.path.join(REPORT_DIR, n), "r", encoding="utf-8") as jf:
                    r = json.load(jf)
            except Exception:
                continue
            d = r.get("started", "")[:10]
            for it in r.get("results", []):
                pth = it.get("path", "")
                if pth and gsc_requests_ok(it.get("status", "")) and d <= today.isoformat() and d > ga.get(pth, ""):
                    ga[pth] = d
                    bf += 1
        if bf:
            log("Backfill state tu %d report: %d URL" % (len(hist), bf))

        master = []
        seen = set()
        for u in STATIC_PRIORITY + posts + sitemap:
            u = "/" + u.strip("/") if u.strip("/") not in ("", None) else "/"
            if u not in seen:
                seen.add(u)
                master.append(u)
        log("Master: %d URL (sitemap %d, DB %d)" % (len(master), len(sitemap), len(posts)))

        # --- GSC ---
        pending_gsc = [
            u for u in master
            if days_since(ga.get(u, ""), today) >= GSC_REATTEMPT_DAYS
        ]
        used = gsc_used_today(REPORT_DIR, today)
        cap = max(0, GSC_DAILY_CAP - used)
        run_start = time.time()
        if pending_gsc and cap:
            batch = pending_gsc[:cap]
            f = os.path.join(REPORT_DIR, "urls-runner-%s.txt" % today.strftime("%Y%m%d"))
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("\n".join(batch) + "\n")
            log("GSC: pending=%d used=%d cap=%d -> %d URL" % (len(pending_gsc), used, cap, len(batch)))
            run_tool(["tools/gsc-index.py", "--urls-file", f, "--limit", str(len(batch)), "--request"], log)
            # doc report moi nhat sinh sau run_start de ghi state
            new_reports = []
            try:
                for n in os.listdir(REPORT_DIR):
                    if n.startswith("gsc-pump-") and n.endswith(".json"):
                        fp = os.path.join(REPORT_DIR, n)
                        if os.path.getmtime(fp) >= run_start:
                            new_reports.append(fp)
            except Exception:
                pass
            ok_urls = 0
            for fp in new_reports:
                try:
                    with open(fp, "r", encoding="utf-8") as jf:
                        r = json.load(jf)
                except Exception:
                    continue
                for it in r.get("results", []):
                    st = it.get("status", "")
                    if gsc_requests_ok(st):
                        d = today.isoformat()
                        if d > ga.get(it.get("path", ""), ""):
                            ga[it.get("path", "")] = d
                            ok_urls += 1
            log("GSC: ghi state %d URL thanh cong" % ok_urls)
            if ok_urls:
                state["gsc"] = ga
                save_state(state)
        elif pending_gsc:
            log("GSC: used=%d -> het quota, bo qua hom nay" % used)
        else:
            log("GSC: khong co URL pending trong %d ngay" % GSC_REATTEMPT_DAYS)

        # --- Bing ---
        remain = 0
        try:
            p = subprocess.run(
                [sys.executable, os.path.join(HERE, "bing-submit.py"), "--check"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
            )
            for ln in (p.stdout or "").splitlines():
                ln2 = ln.strip()
                if ln2.startswith("Quota:"):
                    quota = json.loads(ln2[len("Quota:"):].strip()).get("d") or {}
                    remain = int(quota.get("DailyQuota", 0) or 0)
                    break
            log("Bing quota: remain=%d" % remain)
        except Exception as e:
            log("Bing quota LOI: %s" % re.sub(r"apikey=[^&\s'\"]+", "apikey=REDACTED", str(e)))
        pending_bing = [
            u for u in master
            if days_since(ba.get(u, ""), today) >= BING_REATTEMPT_DAYS
        ]
        if pending_bing and remain:
            batch = pending_bing[:remain]
            f = os.path.join(REPORT_DIR, "urls-bing-runner-%s.txt" % today.strftime("%Y%m%d"))
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("\n".join(batch) + "\n")
            log("Bing: pending=%d remain=%d -> submit %d URL" % (len(pending_bing), remain, len(batch)))
            rc = run_tool(["tools/bing-submit.py", "--urls-file", f], log)
            if rc == 0:
                for u in batch:
                    ba[u] = today.isoformat()
                state["bing"] = ba
                save_state(state)
                log("Bing: ghi state %d URL" % len(batch))
        elif pending_bing:
            log("Bing: het quota hom nay (remain=%d)" % remain)
        else:
            log("Bing: khong co URL pending trong %d ngay" % BING_REATTEMPT_DAYS)

        log("=== index-runner xong trong %.0fs ===" % (time.time() - t0))
    finally:
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass


if __name__ == "__main__":
    main()
