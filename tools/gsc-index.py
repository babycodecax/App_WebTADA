"""GSC Auto Indexing v5 — URL inspection page, CLI-driven with JSON report.

Usage:
  python tools/gsc-index.py --urls-file tools/gsc-index-reports/urls-batchN.txt --request
  python tools/gsc-index.py --urls-file file.txt --limit 10 --request

- Mac dinh CHI INSPECT (doc); co --request moi click "Yeu cau lap chi muc" (ghi thao tac).
- Report JSON luu tools/gsc-index-reports/gsc-pump-YYYY-MM-DD-HHMM.json.
- Quota guard: so URLs request trong NGAY DUONG LICH hom nay doc tat ca report cu; >10 thi TU CHOI co --request.
"""
import sys, io, time, json, os, argparse, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

P = lambda *a, **k: print(*a, **k, flush=True)

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT_DIR = os.path.join(HERE, "gsc-index-reports")
SITE = "https://ketoanthuetada.com"
GSC_HOME = "https://search.google.com/search-console"

URLS = [
    "/blog/cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026",
    "/blog/chuyen-trang-thai-ma-so-thue-tu-03-sang-06",
    "/blog/hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai",
    "/blog/hoa-don-nguoi-tieu-dung-hieu-dung-de-tranh-rui-ro-phap-ly-nam-2026",
    "/blog/huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026",
    "/blog/huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue",
    "/blog/huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026",
    "/blog/kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026",
    "/blog/lo-tay-tip-bang-tien-cong-ty-cach-giai-cuu-giam-doc-khoi-rac-roi-phap-ly",
    "/blog/lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026",
    "/blog/phan-tich-rui-ro-phap-ly-va-thue-trong-giao-dich-chuyen-nhuong-von-nam-2026",
    "/blog/phuong-an-xu-ly-doanh-thu-chua-ke-khai-giai-doan-2023-2025",
    "/blog/quan-ly-hoa-don-dau-vao-cho-ho-kinh-doanh-doanh-thu-duoi-1-ty-dong",
    "/blog/quy-dinh-ve-so-lan-va-thoi-han-tam-ngung-kinh-doanh-cua-cong-ty",
    "/blog/quy-trinh-giai-the-cong-ty-va-dong-ma-so-thue-khi-bi-canh-bao-khong-hoat-dong-tai-dia-chi-dang-ky",
    "/blog/sep-nop-247-trieu-vao-tai-khoan-cong-ty-nam-2026-ke-toan-can-lap-ho-so-hach-toan-va-ke-khai-giao-dich-lien-ket-the-nao-cho-dung",
    "/blog/shopee-no-don-2-ty-va-cai-quen-dat-gia-duong-nao-cho-ho-kinh-doanh",
    "/blog/thue-goi-ten-giam-doc-chay-no-ke-toan-nen-o-lai-chiu-tran-hay-rut-lui-em-dep",
    "/blog/tien-an-xang-xe-chi-co-dinh-coi-chung-mat-tien-thue-oan-vi-ngai-tinh-theo-ngay-cong",
    "/blog/tom-tat-cac-diem-moi-quan-trong-nhat-lien-quan-den-thue-thu-nhap-ca-nhan-tncn-va-ho-kinh-doanh-hkd-tu-03-nghi-dinh-252-253-254-ap-dung-cho-giai-doan-2026",
    "/blog/tom-tat-cac-rui-ro-va-khoan-chi-phi-phat-sinh-khi-ban-tha-troi-doanh-nghiep",
    "/blog/tong-hop-cac-truong-hop-bi-tam-hoan-xuat-canh-do-no-thue-tu-2026",
    "/blog/xu-ly-sai-lech-doanh-thu-va-toi-uu-nghia-vu-phat-khi-kiem-tra-thue-nam-2025",
    "/thu-vien",
]


def find_input(driver, timeout=5):
    """Find the URL inspection search input."""
    selectors = [
        "input[aria-label*='Kiểm tra']",
        "input[aria-label*='Inspect']",
        "input[placeholder*='Kiểm tra']",
        "input[type='text']",
    ]
    for sel in selectors:
        try:
            inputs = driver.find_elements(By.CSS_SELECTOR, sel)
            for inp in inputs:
                if inp.is_displayed() and inp.is_enabled():
                    return inp
        except Exception:
            pass
    return None


def close_popups(driver):
    """Dong tour onboarding + dialog phan hoi + any close button."""
    try:
        driver.execute_script(
            "document.querySelectorAll('[aria-label=\"Đóng\"],[aria-label=\"Close\"]')"
            ".forEach(e=>{try{e.click()}catch(e){}})"
        )
    except Exception:
        pass
    for t in ["Tôi hiểu", "Got it", "Tiếp theo", "Kế tiếp"]:
        try:
            for b in driver.find_elements(By.XPATH, "//*[contains(text(),'%s')]" % t):
                if b.is_displayed():
                    driver.execute_script("arguments[0].click();", b)
                    time.sleep(1)
                    break
        except Exception:
            pass


def wait_inspection_result(driver, max_wait=60):
    """Cho ket qua inspection hien thi (mot trong cac marker)."""
    markers = [
        "URL không có trên Google", "URL is on Google", "URL có trên Google",
        "URL is not on Google", "Trang chưa lập chỉ mục", "URL chưa lập chỉ mục",
        "Trang đã thay đổi?", "Trang đã thay doi?",
    ]
    end = time.time() + max_wait
    while time.time() < end:
        try:
            body = driver.find_element(By.TAG_NAME, "body").text
        except Exception:
            body = ""
        for m in markers:
            if m in body:
                return True
        time.sleep(3)
    return False


def quotas_used_24h():
    """Tong so URL da request trong NGAY DUONG LICH hom nay, doc cac report."""
    if not os.path.isdir(REPORT_DIR):
        return 0
    today = datetime.date.today()
    used = 0
    for fn in os.listdir(REPORT_DIR):
        if not fn.startswith("gsc-pump-") or not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(REPORT_DIR, fn), encoding="utf-8") as f:
                rep = json.load(f)
            ts = rep.get("started")
            if not ts:
                continue
            if datetime.datetime.fromisoformat(ts).date() == today:
                used += int(rep.get("requested", 0))
        except Exception:
            pass
    return used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--urls-file", help="file txt, moi dong 1 path vd /blog/slug")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--request", action="store_true",
                    help="click 'Yeu cau lap chi muc' (co quota guard 10/24h)")
    args = ap.parse_args()

    if args.urls_file:
        with open(args.urls_file, encoding="utf-8-sig") as f:
            paths = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    else:
        paths = list(URLS)
    urls = paths[: args.limit]

    if args.request:
        used = quotas_used_24h()
        if used + len(urls) > 10:
            P("QUOTA GUARD: da dung %d/10 hom nay; dot nay can %d -> TU CHOI." % (used, len(urls)))
            sys.exit(2)
        P("Quota guard OK: used=%d, dot nay=%d" % (used, len(urls)))
    else:
        P("CHE DO CHI DOC (inspect only). Them --request de click nut yeu cau.")

    P("=" * 50)
    P("GSC Auto Indexing v5 | URLs: %d | request=%s" % (len(urls), args.request))
    P("=" * 50)
    os.makedirs(REPORT_DIR, exist_ok=True)
    started = datetime.datetime.now().isoformat(timespec="seconds")
    results = []
    rep_state = {"wrote": False}
    ok, fail = 0, 0

    def write_report(partial=False):
        rep = {
            "started": started,
            "mode": "request" if args.request else "inspect-only",
            "site": SITE,
            "urls": len(urls),
            "requested": ok,
            "other": fail,
            "partial": partial,
            "results": results,
        }
        rep_path = os.path.join(
            REPORT_DIR,
            "gsc-pump-" + datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S") + ".json",
        )
        tmp = rep_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rep, f, ensure_ascii=False, indent=2)
        os.replace(tmp, rep_path)
        P("Report: " + rep_path + (" (PARTIAL)" if partial else ""))
        rep_state["wrote"] = True

    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")
    PROFILE_DIR = os.path.join(HERE, ".gsc-chrome-profile")
    options.add_argument("--user-data-dir=" + PROFILE_DIR)

    P("Launching Chrome...")
    driver = uc.Chrome(options=options, headless=False)

    try:
        # Mo trang chu Search Console
        P("Opening GSC home...")
        driver.get(GSC_HOME)
        time.sleep(8)
        try:
            WebDriverWait(driver, 20).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        except Exception:
            pass
        time.sleep(5)

        # Trang landing khi chua login: 'Start now' / 'Bat dau ngay'
        try:
            for t in ["Start now", "Bắt đầu ngay"]:
                for b in driver.find_elements(By.XPATH, "//*[contains(text(),'%s')]" % t):
                    if b.is_displayed():
                        b.click()
                        P("Clicked: " + t)
                        time.sleep(5)
                        break
                else:
                    continue
                break
        except Exception:
            pass
        time.sleep(2)

        if "accounts.google.com" in driver.current_url:
            P("NEED LOGIN - waiting 3 min...")
            for _ in range(60):
                time.sleep(3)
                if "accounts.google.com" not in driver.current_url:
                    P("Logged in!")
                    time.sleep(3)
                    break
            else:
                P("Login timeout!")
                return

        # Chon property ketoanthuetada.com neu trang wel chon hien ra
        try:
            for el in driver.find_elements(By.XPATH, "//*[contains(text(),'ketoanthuetada.com')]"):
                if el.is_displayed():
                    el.click()
                    P("Chon property")
                    time.sleep(4)
                    break
        except Exception:
            pass
        time.sleep(3)

        MENU_LABELS = ["URL Inspection", "Kiểm tra URL", "URL kiem tra"]

        def open_inspect_menu():
            for label in MENU_LABELS:
                try:
                    items = driver.find_elements(
                        By.XPATH,
                        "//*[@aria-label='{0}' or @title='{0}' or text()='{0}']".format(label)
                    )
                    for it in items:
                        if it.is_displayed():
                            it.click()
                            P("Clicked menu: " + label)
                            time.sleep(4)
                            return True
                except Exception:
                    continue
            return False

        # Mo menu URL Inspection (anh/EN)
        P("Mo menu URL Inspection...")
        if not open_inspect_menu():
            P("WARN: khong click duoc menu URL Inspection")
        time.sleep(2)

        # Find the search input
        P("Finding search input...")
        search_input = find_input(driver)
        if not search_input:
            P("ERROR: Cannot find search input!")
            driver.save_screenshot("D:/Projects/App_WebTADA/tools/gsc-error.png")
            return
        P("Found input!")

        def type_and_enter(inp, full_url):
            driver.execute_script("arguments[0].click();", inp)
            time.sleep(0.5)
            driver.execute_script("arguments[0].value='';", inp)
            time.sleep(0.3)
            inp.send_keys(full_url)
            time.sleep(0.5)
            # Dong dropdown lich su truoc khi ENTER
            # (dropdown mo => ENTER chi chon item lich su, khong chay inspection)
            try:
                inp.send_keys(Keys.ESCAPE)
                time.sleep(0.5)
            except Exception:
                pass
            inp.send_keys(Keys.ENTER)

        def body_has_slug(u):
            slug = u.strip("/").split("/")[-1]
            try:
                return slug in driver.find_element(By.TAG_NAME, "body").text
            except Exception:
                return False

        # Process each URL
        P(f"\nXu ly {len(urls)} URLs (request={args.request})...")
        for i, url in enumerate(urls, 1):
            full = f"{SITE}{url}"
            P(f"  [{i}/{len(urls)}] {url}")

            try:
                close_popups(driver)
                search_input = find_input(driver, timeout=8)
                if not search_input:
                    P(f"    -> Skip (no input found)")
                    results.append({"path": url, "status": "no-input"})
                    fail += 1
                    continue

                # Clear and type URL
                type_and_enter(search_input, full)
                P("    Waiting for inspection...")
                wait_inspection_result(driver, 45)
                time.sleep(2)

                # Panel co the chon nham item lich su hoac khong render:
                # xac minh slug trong panel, khong khop thi reset qua menu roi thu lai
                if not body_has_slug(url):
                    P("    slug khong khop - reset qua menu + thu lai...")
                    open_inspect_menu()
                    inp2 = find_input(driver, timeout=8)
                    if inp2:
                        type_and_enter(inp2, full)
                        wait_inspection_result(driver, 45)
                        time.sleep(2)

                if args.request and not body_has_slug(url):
                    P(f"    -> Skip (URL mismatch, tranh click nham nut request)")
                    results.append({"path": url, "status": "url-mismatch"})
                    try:
                        driver.save_screenshot(f"D:/Projects/App_WebTADA/tools/gsc-mismatch{i}.png")
                    except Exception:
                        pass
                    fail += 1
                    continue

                if not args.request:
                    slug = url.strip("/").split("/")[-1]
                    try:
                        body_txt = driver.find_element(By.TAG_NAME, "body").text
                    except Exception:
                        body_txt = ""
                    P("    inspect-only: slug-in-panel=%s body-len=%d" % (bool(slug in body_txt), len(body_txt)))
                    if i <= 3:
                        try:
                            driver.save_screenshot(f"D:/Projects/App_WebTADA/tools/gsc-skip{i}.png")
                        except Exception:
                            pass
                    results.append({"path": url, "status": "inspected-only"})
                    continue

                # Take screenshot for debugging
                if i <= 3:
                    try:
                        driver.save_screenshot(f"D:/Projects/App_WebTADA/tools/gsc-url{i}.png")
                    except Exception:
                        pass

                found = False
                for attempt in range(12):
                    if attempt:
                        time.sleep(10)
                    for btn_text in ["Yêu cầu lập chỉ mục", "Request indexing", "YÊU CẦU LẬP CHỈ MỤC"]:
                        try:
                            btns = driver.find_elements(By.XPATH, f"//*[contains(text(),'{btn_text}')]")
                            for btn in btns:
                                if btn.is_displayed() and btn.is_enabled():
                                    btn.click()
                                    P(f"    Clicked: {btn_text}")
                                    time.sleep(3)
                                    # UI moi: click la gui ngay, xac nhan bang banner xanh
                                    sent = False
                                    end2 = time.time() + 15
                                    while time.time() < end2:
                                        try:
                                            body_txt = driver.find_element(By.TAG_NAME, "body").text
                                        except Exception:
                                            body_txt = ""
                                        if ("Đã yêu cầu lập chỉ mục" in body_txt) or ("Indexing requested" in body_txt):
                                            sent = True
                                            break
                                        time.sleep(2)
                                    ok += 1
                                    results.append({"path": url, "status": "submitted" if sent else "clicked-no-banner"})
                                    P("    Submitted!" if sent else "    (click gui - khong thay banner)")
                                    found = True
                                    break
                            if found:
                                break
                        except Exception:
                            pass
                    if found:
                        break

                if not found:
                    P(f"    -> Skip (button not found)")
                    try:
                        body_txt = driver.find_element(By.TAG_NAME, "body").text
                        P("    dbg: body-len=%d has-changed=%s has-noton-google=%s" % (
                            len(body_txt),
                            ("Trang đã thay đổi" in body_txt) or (" Trang da thay doi" in body_txt),
                            ("không có trên Google" in body_txt) or ("is not on Google" in body_txt),
                        ))
                    except Exception:
                        pass
                    try:
                        driver.save_screenshot(f"D:/Projects/App_WebTADA/tools/gsc-nobutton{i}.png")
                    except Exception:
                        pass
                    results.append({"path": url, "status": "no-button"})
                    fail += 1

            except Exception as e:
                P(f"    -> Error: {e}")
                results.append({"path": url, "status": "error", "err": str(e)[:120]})
                fail += 1

            if i < len(urls):
                time.sleep(5)  # Rate limit

        P(f"\nKet qua: {ok} request OK / {fail} khac (request={args.request})")
        P("Google crawl trong 1-7 ngay.")
        write_report()
        time.sleep(5)

    finally:
        if not rep_state["wrote"]:
            try:
                write_report(partial=True)
            except Exception as e2:
                P("Report partial loi: %s" % e2)
        driver.quit()


if __name__ == "__main__":
    main()
