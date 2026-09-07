"""Debug GSC page structure."""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
P = lambda *a, **k: print(*a, **k, flush=True)

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

P("Launching Chrome...")
driver = uc.Chrome(options=uc.ChromeOptions(), headless=False)

try:
    P("Opening GSC...")
    driver.get("https://search.google.com/search-console/url-inspection?resource_id=https%3A%2F%2Fketoanthuetada.com%2F")
    time.sleep(15)  # Wait extra long

    P(f"URL: {driver.current_url}")

    # Dump all inputs
    inputs = driver.find_elements(By.TAG_NAME, "input")
    P(f"Found {len(inputs)} input elements:")
    for i, inp in enumerate(inputs):
        try:
            attrs = {}
            for attr in ["type", "placeholder", "aria-label", "name", "id", "class", "value"]:
                val = inp.get_attribute(attr)
                if val:
                    attrs[attr] = val[:80]
            P(f"  [{i}] {attrs}")
        except:
            pass

    # Dump all buttons
    buttons = driver.find_elements(By.TAG_NAME, "button")
    P(f"\nFound {len(buttons)} button elements:")
    for i, btn in enumerate(buttons[:15]):
        try:
            txt = btn.text.strip()[:60]
            if txt:
                P(f"  [{i}] {txt}")
        except:
            pass

    driver.save_screenshot("D:/CodeApp/Projects/App_WebTADA/tools/gsc-debug.png")
    P("\nScreenshot saved")

finally:
    driver.quit()
