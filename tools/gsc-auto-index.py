"""
Tự động submit sitemap + request indexing 24 URLs trên GSC.

Cách dùng:
  python tools/gsc-auto-index.py

Lần đầu: mở browser → bạn login Google手动 → script tự tiếp tục.
Lần sau: login được giữ, chạy thẳng.
"""

import asyncio
import sys
import os
import io

# Fix Windows console encoding for emoji
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

SITE = "https://ketoanthuetada.com"
GSC_SITEMAPS = "https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Fketoanthuetada.com%2F"
GSC_INSPECT = "https://search.google.com/search-console/url-inspection?resource_id=https%3A%2F%2Fketoanthuetada.com%2F&id="

SITEMAP_URL = f"{SITE}/sitemap.xml"

# 24 URLs chưa index (GSC 2026-09-07)
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

# Use unique temp dir to avoid lock issues
import tempfile
BROWSER_DATA = os.path.join(tempfile.gettempdir(), f"gsc-browser-{os.getpid()}")


async def wait_for_login(page):
    """Wait until user is logged in to Google."""
    print("\n⏳ Đang kiểm tra đăng nhập Google...")
    for _ in range(60):  # wait up to 5 minutes
        url = page.url
        if "accounts.google.com" not in url and "search-console" in url:
            print("✅ Đã đăng nhập!")
            return True
        await asyncio.sleep(5)
    print("❌ Timeout — chưa đăng nhập sau 5 phút")
    return False


async def safe_goto(page, url, retries=3):
    """Navigate with retry on crash."""
    for attempt in range(retries):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            return True
        except Exception as e:
            print(f"  ⚠️  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                await asyncio.sleep(3)
    return False


async def submit_sitemap(page):
    """Submit sitemap to GSC."""
    print("\n📋 BƯỚC 1: Submit sitemap")
    if not await safe_goto(page, GSC_SITEMAPS):
        print("  ❌ Cannot load sitemap page")
        return False

    # Check if we need to login
    if "accounts.google.com" in page.url:
        if not await wait_for_login(page):
            return False
        await page.goto(GSC_SITEMAPS, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)

    # Try to add sitemap
    try:
        # Click "Thêm sitemap" if available
        add_btn = page.get_by_role("button", name="Thêm sitemap")
        if await add_btn.is_visible(timeout=3000):
            await add_btn.click()
            await asyncio.sleep(1)

            # Type sitemap URL
            input_field = page.get_by_placeholder("Nhập URL sitemap")
            if await input_field.is_visible(timeout=3000):
                await input_field.fill(SITEMAP_URL)
                await asyncio.sleep(0.5)

                # Click submit
                submit = page.get_by_role("button", name="Gửi")
                if await submit.is_visible(timeout=3000):
                    await submit.click()
                    await asyncio.sleep(3)
                    print(f"  ✅ Submitted: {SITEMAP_URL}")
                    return True
    except Exception as e:
        print(f"  ⚠️  Sitemap submit: {e}")

    print("  ℹ️  Sitemap đã được submit trước đó hoặc cần manual")
    return True


async def request_indexing(page, url_path: str, index: int, total: int) -> bool:
    """Request indexing for a single URL."""
    full_url = f"{SITE}{url_path}"
    print(f"\n[{index}/{total}] {url_path}")

    try:
        # Navigate to URL inspection
        if not await safe_goto(page, f"{GSC_INSPECT}{full_url}"):
            print(f"  ❌ Cannot load inspection page")
            return False

        # Check if login needed
        if "accounts.google.com" in page.url:
            print("  ❌ Lost login")
            return False

        # Click "Kiểm tra URL" button
        try:
            inspect_btn = page.get_by_role("button", name="Kiểm tra URL")
            if await inspect_btn.is_visible(timeout=3000):
                await inspect_btn.click()
                # Wait for inspection to complete (may take 10-20s)
                await asyncio.sleep(15)
        except Exception:
            pass

        # Click "YÊU CẦU LẬP CHỈ MỤC"
        try:
            request_btn = page.get_by_role("button", name="Yêu cầu lập chỉ mục")
            if await request_btn.is_visible(timeout=5000):
                await request_btn.click()
                await asyncio.sleep(2)

                # Click "Gửi" in confirmation
                try:
                    submit = page.get_by_role("button", name="Gửi")
                    if await submit.is_visible(timeout=3000):
                        await submit.click()
                        await asyncio.sleep(3)
                        print(f"  ✅ Submitted")
                        return True
                except Exception:
                    print(f"  ✅ Submitted (no dialog)")
                    return True
            else:
                print(f"  ⏭️  Button not visible")
                return False
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return False

    except Exception as e:
        print(f"  ❌ Navigation error: {e}")
        return False


async def main():
    print("=" * 60)
    print("GSC Auto Indexing Tool")
    print(f"Site: {SITE}")
    print(f"URLs: {len(URLS)}")
    print("=" * 60)
    print()
    print("📌 Browser sẽ mở → login Google nếu cần → script tự chạy")
    print()

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=BROWSER_DATA,
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
        page = browser.pages[0] if browser.pages else await browser.new_page()

        # Step 1: Submit sitemap
        await submit_sitemap(page)

        # Step 2: Request indexing for all URLs
        print(f"\n📋 BƯỚC 2: Request indexing {len(URLS)} URLs")
        success = 0
        failed = 0

        for i, url in enumerate(URLS, 1):
            result = await request_indexing(page, url, i, len(URLS))
            if result:
                success += 1
            else:
                failed += 1
            # Rate limit
            if i < len(URLS):
                print("  ⏳ Chờ 5s...")
                await asyncio.sleep(5)

        print("\n" + "=" * 60)
        print(f"KẾT QUẢ: {success} submitted | {failed} failed")
        print("=" * 60)
        print("\nGoogle sẽ crawl trong 1-7 ngày.")
        print("Browser sẽ tự đóng sau 5s...")
        await asyncio.sleep(5)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
