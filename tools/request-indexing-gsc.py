"""
Tự động request indexing cho các URLs chưa được Google index qua GSC.

Yêu cầu:
  1. pip install playwright
  2. playwright install chromium
  3. Đăng nhập Google trên Chromium: python -m playwright install chromium
     rồi mở browser, login Google account có quyền GSC ketoanthuetada.com

Cách dùng:
  python tools/request-indexing-gsc.py

Script sẽ:
  1. Mở GSC URL Inspection cho từng URL
  2. Request indexing
  3. Chờ 5s giữa mỗi request để tránh rate limit
"""

import asyncio
import sys
from playwright.async_api import async_playwright

SITE = "https://ketoanthuetada.com"
GSC_INDEX_URL = "https://search.google.com/search-console/index"

# 24 URLs chưa index theo GSC (2026-09-07)
URLS_TO_INDEX = [
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


async def request_indexing_for_url(page, url: str, index: int, total: int) -> bool:
    """Request indexing for a single URL via GSC URL Inspection."""
    full_url = f"{SITE}{url}"
    print(f"\n[{index}/{total}] Requesting: {url}")

    try:
        # Navigate to URL Inspection
        inspection_url = f"https://search.google.com/search-console/url-inspection?resource_id=https%3A%2F%2Fketoanthuetada.com%2F&id={full_url}"
        await page.goto(inspection_url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)

        # Click "Kiểm tra URL" (Inspect URL) button if visible
        try:
            inspect_btn = page.get_by_role("button", name="Kiểm tra URL")
            if await inspect_btn.is_visible(timeout=3000):
                await inspect_btn.click()
                await asyncio.sleep(5)  # Wait for inspection to complete
        except Exception:
            pass

        # Wait for page to load results
        await asyncio.sleep(3)

        # Click "YÊU CẦU LẬP CHỈ MỤC" (Request Indexing) button
        try:
            request_btn = page.get_by_role("button", name="Yêu cầu lập chỉ mục")
            if await request_btn.is_visible(timeout=5000):
                await request_btn.click()
                await asyncio.sleep(2)

                # Click "Gửi" (Submit) if confirmation dialog appears
                try:
                    submit_btn = page.get_by_role("button", name="Gửi")
                    if await submit_btn.is_visible(timeout=3000):
                        await submit_btn.click()
                        await asyncio.sleep(3)
                        print(f"  ✅ Submitted: {url}")
                        return True
                except Exception:
                    print(f"  ⚠️  Submitted (no confirmation dialog)")
                    return True
            else:
                print(f"  ⏭️  Request button not visible (may already be indexed)")
                return False
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return False

    except Exception as e:
        print(f"  ❌ Navigation error: {e}")
        return False


async def main():
    print("=" * 60)
    print("GSC Request Indexing Tool")
    print(f"Site: {SITE}")
    print(f"URLs to index: {len(URLS_TO_INDEX)}")
    print("=" * 60)
    print()
    print("⚠️  Đảm bảo bạn đã đăng nhập Google account")
    print("    có quyền GSC cho ketoanthuetada.com")
    print()

    async with async_playwright() as p:
        # Launch browser with user data dir to preserve login
        browser = await p.chromium.launch_persistent_context(
            user_data_dir="./.browser-data",
            headless=False,  # Set to True if you have saved login
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.pages[0] if browser.pages else await browser.new_page()

        success = 0
        failed = 0
        skipped = 0

        for i, url in enumerate(URLS_TO_INDEX, 1):
            result = await request_indexing_for_url(page, url, i, len(URLS_TO_INDEX))
            if result is True:
                success += 1
            elif result is False:
                skipped += 1
            else:
                failed += 1

            # Rate limit: wait between requests
            if i < len(URLS_TO_INDEX):
                print(f"  ⏳ Waiting 5s before next request...")
                await asyncio.sleep(5)

        print("\n" + "=" * 60)
        print("RESULTS:")
        print(f"  ✅ Submitted: {success}")
        print(f"  ⏭️  Skipped:   {skipped}")
        print(f"  ❌ Failed:    {failed}")
        print("=" * 60)

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
