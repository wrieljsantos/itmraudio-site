from pathlib import Path
import os

from playwright.sync_api import sync_playwright


BASE = os.environ.get("SITE_BASE_URL", Path.cwd().resolve().as_uri()).rstrip("/")
OUT = Path("test-artifacts")
OUT.mkdir(exist_ok=True)

PAGES = {
    "coming-soon": ("/index.html", "Stay on the song."),
    "vox": ("/arc-vox.html", "Keep your head on the song."),
    "fx": ("/arc-fx.html", "Quit using the sound exactly as you found it."),
}

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "mobile": {"width": 390, "height": 844},
}


def main() -> None:
    failures: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for viewport_name, viewport in VIEWPORTS.items():
            context = browser.new_context(viewport=viewport)
            for page_name, (path, expected_h1) in PAGES.items():
                page = context.new_page()
                console_errors: list[str] = []
                page.on("console", lambda msg, errors=console_errors: errors.append(msg.text) if msg.type == "error" else None)
                response = page.goto(BASE + path, wait_until="domcontentloaded", timeout=30_000)
                if response is None or not response.ok:
                    failures.append(f"{viewport_name}/{page_name}: page did not load successfully")
                    page.close()
                    continue
                page.wait_for_timeout(1_500)

                h1 = " ".join(page.locator("h1").first.inner_text().split())
                if expected_h1.casefold() not in h1.casefold():
                    failures.append(f"{viewport_name}/{page_name}: unexpected h1 {h1!r}")

                overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
                if overflow:
                    failures.append(f"{viewport_name}/{page_name}: horizontal overflow")

                broken_images = page.locator("img").evaluate_all(
                    "els => els.filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'))"
                )
                if broken_images:
                    failures.append(f"{viewport_name}/{page_name}: broken images {broken_images}")

                if console_errors:
                    failures.append(f"{viewport_name}/{page_name}: console errors {console_errors}")

                if page_name == "coming-soon":
                    if page.locator("#signup-form input[type=email]").count() != 1:
                        failures.append(f"{viewport_name}/{page_name}: signup email field missing")
                    if page.locator("#signup-form button[type=submit]").is_disabled():
                        failures.append(f"{viewport_name}/{page_name}: signup button is disabled")

                page.screenshot(path=str(OUT / f"{page_name}-{viewport_name}.png"), full_page=True)
                page.close()
            context.close()
        browser.close()

    if failures:
        raise AssertionError("\n".join(failures))
    print(f"PASS: {len(PAGES) * len(VIEWPORTS)} responsive page checks")


if __name__ == "__main__":
    main()
