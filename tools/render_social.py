"""Render code-based share cards using original UI exports, never reconstructed UI."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    out = ROOT / "assets/social"
    out.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        page.goto((ROOT / "tools/social-cards.html").as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        assert page.evaluate("document.fonts.check('500 48px \"Space Grotesk\"')"), "Brand font did not load"
        assert page.locator("img").evaluate_all("els => els.every(i => i.complete && i.naturalWidth > 0)"), "Missing source artwork"
        for slug in ["itmr-audio-plugins", "arc-vox-vocal-plugin", "arc-fx-effects-plugin"]:
            page.locator("#" + slug).screenshot(path=str(out / (slug + ".png")))
        for size in [512, 180, 96]:
            page.locator("#brand-icon").evaluate("(el, size) => {el.style.width=size+'px';el.style.height=size+'px';el.querySelector('img').style.width=(size*.71875)+'px';el.querySelector('img').style.height=(size*.71875)+'px'}", size)
            page.locator("#brand-icon").screenshot(path=str(ROOT / f"assets/brand/itmr-audio-icon-{size}.png"))
        browser.close()
    print("Rendered 3 social previews (1200x630) and 3 brand icons.")

if __name__ == "__main__":
    main()
