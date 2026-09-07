"""GSC Auto Indexing v4 — stays on URL inspection page."""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

P = lambda *a, **k: print(*a, **k, flush=True)

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

SITE = "https://ketoanthuetada.com"
GSC_INSPECT = "https://search.google.com/search-console/url-inspection?resource_id=https%3A%2F%2Fketoanthuetada.com%2F"

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


def main():
    P("=" * 50)
    P("GSC Auto Indexing v4")
    P(f"Site: {SITE}  URLs: {len(URLS)}")
    P("=" * 50)

    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")

    P("Launching Chrome...")
    driver = uc.Chrome(options=options, headless=False)

    try:
        # Navigate to URL Inspection page directly
        P("Opening GSC URL Inspection...")
        driver.get(GSC_INSPECT)
        time.sleep(10)  # Wait longer for page to fully load

        # Wait for page to be fully interactive
        try:
            WebDriverWait(driver, 15).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        except Exception:
            pass
        time.sleep(5)  # Extra wait for JS to render

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

        # Find the search input
        P("Finding search input...")
        search_input = find_input(driver)
        if not search_input:
            P("ERROR: Cannot find search input!")
            driver.save_screenshot("D:/CodeApp/Projects/App_WebTADA/tools/gsc-error.png")
            return
        P("Found input!")

        # Process each URL
        P(f"\nRequest indexing {len(URLS)} URLs...")
        ok, fail = 0, 0
        for i, url in enumerate(URLS, 1):
            full = f"{SITE}{url}"
            P(f"  [{i}/{len(URLS)}] {url}")

            try:
                # Find input again (page may have changed)
                search_input = find_input(driver, timeout=5)
                if not search_input:
                    P(f"    -> Skip (no input found)")
                    fail += 1
                    continue

                # Clear and type URL
                search_input.click()
                time.sleep(0.3)
                search_input.clear()
                time.sleep(0.3)
                search_input.send_keys(full)
                time.sleep(0.5)
                search_input.send_keys(Keys.ENTER)

                # Wait for inspection to complete
                P("    Waiting for inspection...")
                time.sleep(20)  # Longer wait for inspection

                # Take screenshot for debugging
                if i <= 3:
                    driver.save_screenshot(f"D:/CodeApp/Projects/App_WebTADA/tools/gsc-url{i}.png")

                # Look for "Yêu cầu lập chỉ mục" button
                found = False
                for btn_text in ["Yêu cầu lập chỉ mục", "Request indexing", "YÊU CẦU LẬP CHỈ MỤC"]:
                    try:
                        btns = driver.find_elements(By.XPATH, f"//*[contains(text(),'{btn_text}')]")
                        for btn in btns:
                            if btn.is_displayed() and btn.is_enabled():
                                btn.click()
                                P(f"    Clicked: {btn_text}")
                                time.sleep(2)
                                # Click submit in confirmation
                                try:
                                    gui = driver.find_element(By.XPATH, "//*[contains(text(),'Gửi') or contains(text(),'Submit')]")
                                    if gui.is_displayed():
                                        gui.click()
                                        time.sleep(3)
                                        P(f"    Submitted!")
                                except Exception:
                                    P(f"    Submitted (no dialog)")
                                found = True
                                ok += 1
                                break
                        if found:
                            break
                    except Exception:
                        pass

                if not found:
                    P(f"    -> Skip (button not found)")
                    fail += 1

            except Exception as e:
                P(f"    -> Error: {e}")
                fail += 1

            if i < len(URLS):
                time.sleep(5)  # Rate limit

        P(f"\nKet qua: {ok} OK / {fail} fail")
        P("Google crawl trong 1-7 ngay.")
        time.sleep(5)

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
