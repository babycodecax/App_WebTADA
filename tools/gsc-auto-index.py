"""
Doc so lieu GSC + (tuy chon) request indexing qua Playwright.

Cach dung:
  python tools/gsc-auto-index.py --dry-run     # khong mo browser, chi in ke hoach
  python tools/gsc-auto-index.py               # doc overview + inspect (chi doc)
  python tools/gsc-auto-index.py --request     # + request indexing (can duyet truoc)
  python tools/gsc-auto-index.py --limit 5     # gioi han so URL (mac dinh 10)

Lan dau: browser mo ra -> ban login Google bang tay -> script tu tiep tuc.
Lan sau: login duoc giu trong tools/.gsc-profile (da gitignore).

Revive 2026-09-17: sua bug profile temp-dir + them che do chi-doc luu JSON
+ lay URL tu sitemap live. Fix sau review: regex khong dau/codau song song,
sitemap-index de quy, try/finally, ngat khi mat login, --limit, quote id.
"""

import argparse
import asyncio
import datetime
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

# Fix Windows console encoding for emoji
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from playwright.async_api import async_playwright

SITE = "https://ketoanthuetada.com"
RESOURCE = "resource_id=https%3A%2F%2Fketoanthuetada.com%2F"
GSC_INDEX = f"https://search.google.com/search-console/index?{RESOURCE}&pages=ALL_URLS"
GSC_INSPECT = (
    "https://search.google.com/search-console/inspect"
    f"?{RESOURCE}&id="
)
SITEMAP_URL = f"{SITE}/sitemap.xml"

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
# Profile co dinh -> giu login giua cac lan chay (KHONG de temp-dir).
PROFILE_DIR = os.path.join(TOOLS_DIR, ".gsc-profile")
REPORT_DIR = os.path.join(TOOLS_DIR, "gsc-reports")

# Fallback khi khong tai duoc sitemap live.
FALLBACK_URLS = [
    "/blog/16-luu-y-hoa-don-dien-tu-2026-cho-ke-toan-vien",
    "/blog/giam-30-thue-tncn-2026-ai-duoc-huong",
    "/blog/ty-gia-ngoai-te-tren-hoa-don-dien-tu-2026",
    "/blog/dung-ten-ho-cong-ty-no-thue-co-bi-truy-to-khong",
    "/tinh-thue",
]

# Regex chiu duoc ca UI tieng Viet (co dau) lan khong dau + UI tieng Anh.
BTN_INSPECT = re.compile(r"^\s*k\w*m tra url\s*$|^\s*inspect url\s*$", re.I)
BTN_REQUEST = re.compile(
    r"^\s*y\w*u c\w*u l\w*p ch\w* m\w*c\s*$|request indexing", re.I
)
BTN_SEND = re.compile(r"^\s*g(\w|ử)*i\s*$|^\s*send\s*$|^\s*submit\s*$", re.I)


def strip_accents(text):
    """Bo dau tieng Viet de so sanh khong phu thuoc ngon ngu UI."""
    nfkd = unicodedata.normalize("NFD", text)
    no_mark = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return no_mark.replace("đ", "d").replace("Đ", "D").lower()


def fetch_xml(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def load_urls_from_sitemap():
    """Lay URL bai viet tu sitemap live, ho tro sitemap-index de quy."""
    try:
        xml = fetch_xml(SITEMAP_URL)
        locs = re.findall(r"<loc>(.*?)</loc>", xml)
        if "<sitemapindex" in xml:
            print("  Sitemap la index, fetch de quy sub-sitemaps...")
            page_locs = []
            for loc in locs:
                loc = loc.strip()
                if not loc.endswith(".xml"):
                    continue
                try:
                    sub = fetch_xml(loc)
                    page_locs += re.findall(r"<loc>(.*?)</loc>", sub)
                except Exception as e:
                    print(f"  Bo qua sub-sitemap {loc}: {e}")
            locs = page_locs
        paths = []
        for loc in locs:
            loc = loc.strip()
            if loc.endswith(".xml"):
                continue
            if loc.startswith(SITE):
                path = loc[len(SITE):] or "/"
                if path not in paths:
                    paths.append(path)
        if paths:
            print(f"  Sitemap live: {len(paths)} URLs")
            return paths
    except Exception as e:
        print(f"  Sitemap fetch that bai ({e}), dung fallback")
    return list(FALLBACK_URLS)


def inspect_link(full_url):
    return GSC_INSPECT + urllib.parse.quote(full_url, safe="")


async def wait_for_login(page):
    """Doi user login Google bang tay (toi da 5 phut)."""
    print("\n  Dang kiem tra dang nhap Google...")
    print("  Neu browser hien trang login, ban hay dang nhap bang tay.")
    for _ in range(60):
        url = page.url
        if "accounts.google.com" not in url and "search-console" in url:
            print("  Da dang nhap!")
            return True
        await asyncio.sleep(5)
    print("  Timeout - chua dang nhap sau 5 phut")
    return False


async def safe_goto(page, url, retries=3):
    """Navigate voi retry."""
    for attempt in range(retries):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            return True
        except Exception as e:
            print(f"  Attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                await asyncio.sleep(3)
    return False


async def ensure_login(page, target_url):
    """Ve trang target, neu gap login thi doi user login tay."""
    if not await safe_goto(page, target_url):
        return False
    if "accounts.google.com" in page.url:
        if not await wait_for_login(page):
            return False
        if not await safe_goto(page, target_url):
            return False
    return True


async def read_overview(page):
    """Doc trang tong quan index, tra ve text + so lieu (neu boc tach duoc)."""
    print("\nBUOC 1: Doc tong quan index")
    if not await ensure_login(page, GSC_INDEX):
        print("  Khong mo duoc trang index")
        return {"ok": False}
    await asyncio.sleep(5)  # cho GSC render xong
    body_text = await page.evaluate("document.body ? document.body.innerText : ''")
    norm = strip_accents(body_text)
    data = {"ok": True, "raw_text": body_text[:4000]}
    m_indexed = re.search(r"(\d+)\s*[^\d]{0,30}(da duoc lap chi muc|indexed)", norm)
    if m_indexed:
        data["indexed_hint"] = m_indexed.group(1)
    m_disc = re.search(r"(\d+)\s*[^\d]{0,40}(discovered|da phat hien)", norm)
    if m_disc:
        data["discovered_hint"] = m_disc.group(1)
    shot = os.path.join(REPORT_DIR, "gsc-overview.png")
    await page.screenshot(path=shot, full_page=False)
    data["screenshot"] = shot
    print(f"  Da luu screenshot: {shot}")
    return data


async def read_inspect_text(page):
    body_text = await page.evaluate("document.body ? document.body.innerText : ''")
    return body_text


def verdict_from_text(body_text):
    norm = strip_accents(body_text)
    if re.search(r"url is not on google|url khong nam tren google", norm):
        return "NOT_INDEXED"
    if re.search(r"url is on google|url nam tren google", norm):
        return "INDEXED"
    return "UNKNOWN"


async def inspect_only(page, url_path, index, total):
    """Inspect 1 URL o che do chi-doc, tra ve verdict text."""
    full_url = f"{SITE}{url_path}"
    print(f"\n[{index}/{total}] {url_path}")
    if not await safe_goto(page, inspect_link(full_url)):
        return {"url": full_url, "ok": False, "error": "navigation"}
    if "accounts.google.com" in page.url:
        return {"url": full_url, "ok": False, "error": "lost-login"}
    try:
        inspect_btn = page.get_by_role("button", name=BTN_INSPECT)
        if await inspect_btn.is_visible(timeout=3000):
            await inspect_btn.click()
            try:
                await page.wait_for_selector(
                    "text=/nằm trên Google|not on Google|is on Google/i",
                    timeout=25000,
                )
            except Exception:
                pass
            await asyncio.sleep(2)
    except Exception:
        pass
    try:
        verdict = verdict_from_text(await read_inspect_text(page))
        print(f"  Verdict: {verdict}")
        return {"url": full_url, "ok": True, "verdict": verdict}
    except Exception as e:
        return {"url": full_url, "ok": False, "error": str(e)[:200]}


async def request_indexing(page, url_path, index, total):
    """Request indexing cho 1 URL. CHI chay khi co flag --request."""
    full_url = f"{SITE}{url_path}"
    print(f"\n[{index}/{total}] {url_path}")
    try:
        if not await safe_goto(page, inspect_link(full_url)):
            print("  Khong mo duoc trang inspect")
            return False
        if "accounts.google.com" in page.url:
            print("  Mat login")
            return False
        try:
            inspect_btn = page.get_by_role("button", name=BTN_INSPECT)
            if await inspect_btn.is_visible(timeout=3000):
                await inspect_btn.click()
                await asyncio.sleep(15)
        except Exception:
            pass
        try:
            request_btn = page.get_by_role("button", name=BTN_REQUEST)
            if await request_btn.is_visible(timeout=5000):
                await request_btn.click()
                await asyncio.sleep(2)
                try:
                    submit = page.get_by_role("button", name=BTN_SEND)
                    if await submit.is_visible(timeout=3000):
                        await submit.click()
                        await asyncio.sleep(3)
                except Exception:
                    pass
                print("  Da gui request")
                return True
            print("  Nut request khong hien")
            return False
        except Exception as e:
            print(f"  Loi: {e}")
            return False
    except Exception as e:
        print(f"  Loi dieu huong: {e}")
        return False


async def run_browser(do_request, limit):
    os.makedirs(REPORT_DIR, exist_ok=True)
    urls = load_urls_from_sitemap()[:limit]
    print("=" * 60)
    print("GSC Reader (Playwright)")
    print(f"Site: {SITE}")
    print(f"URLs (gioi han {limit}): {len(urls)}")
    print(f"Che do: {'DOC + REQUEST' if do_request else 'CHI DOC'}")
    print("=" * 60)

    report = {
        "date": datetime.datetime.now().isoformat(timespec="seconds"),
        "site": SITE,
        "mode": "request" if do_request else "read",
        "overview": {},
        "inspections": [],
    }

    async with async_playwright() as p:
        context = None
        try:
            context = await p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            viewport={"width": 1280, "height": 800},
        )
            page = context.pages[0] if context.pages else await context.new_page()

            report["overview"] = await read_overview(page)
            if not report["overview"].get("ok"):
                report["skipped"] = "overview-failed"
                print("  Dung lai: khong doc duoc overview.")
                return report

            print(f"\nBUOC 2: Inspect {len(urls)} URLs (chi doc)")
            lost_streak = 0
            for i, url in enumerate(urls, 1):
                result = await inspect_only(page, url, i, len(urls))
                report["inspections"].append(result)
                if result.get("error") == "lost-login":
                    lost_streak += 1
                    if lost_streak >= 2:
                        report["skipped"] = "lost-login"
                        print("  Dung lai: mat login 2 lan lien tiep.")
                        break
                else:
                    lost_streak = 0
                if i < len(urls):
                    await asyncio.sleep(10)  # tranh rate limit

            if do_request and "skipped" not in report:
                print(f"\nBUOC 3: Request indexing {len(urls)} URLs")
                ok = fail = fail_streak = 0
                for i, url in enumerate(urls, 1):
                    if await request_indexing(page, url, i, len(urls)):
                        ok += 1
                        fail_streak = 0
                    else:
                        fail += 1
                        fail_streak += 1
                        if fail_streak >= 2:
                            report["skipped"] = "request-failed"
                            print("  Dung lai: request that bai 2 lan lien tiep.")
                            break
                    if i < len(urls):
                        await asyncio.sleep(5)
                report["request_result"] = {"ok": ok, "fail": fail}
                print(f"\nKET QUA REQUEST: {ok} ok | {fail} fail")
        finally:
            out = os.path.join(
                REPORT_DIR, f"gsc-{datetime.date.today().isoformat()}.json"
            )
            with open(out, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            print(f"\nDa luu bao cao: {out}")
            if context is not None:
                print("Browser tu dong sau 5s...")
                await asyncio.sleep(5)
                await context.close()
    return report


def main():
    ap = argparse.ArgumentParser(description="Doc so lieu GSC qua Playwright")
    ap.add_argument("--dry-run", action="store_true", help="Chi in ke hoach, khong mo browser")
    ap.add_argument("--request", action="store_true", help="Request indexing (can duyet truoc)")
    ap.add_argument("--limit", type=int, default=10, help="Gioi han so URL (mac dinh 10)")
    args = ap.parse_args()

    if args.dry_run:
        urls = load_urls_from_sitemap()[: args.limit]
        print(f"DRY-RUN: {len(urls)} URLs (gioi han {args.limit}), 5 dau:")
        for u in urls[:5]:
            print(f"  {u}")
        print(f"Profile: {PROFILE_DIR}")
        print(f"Report dir: {REPORT_DIR}")
        print(f"Mode khi chay that: {'request' if args.request else 'read-only'}")
        return

    asyncio.run(run_browser(do_request=args.request, limit=args.limit))


if __name__ == "__main__":
    main()
