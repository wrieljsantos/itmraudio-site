"""Check what a crawler can read without executing JavaScript."""
import json
import struct
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = "https://itmraudio.com"
PAGES = {"/": "index.html", "/arc-vox": "arc-vox.html", "/arc-fx": "arc-fx.html"}


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.meta = {}; self.canonicals = []; self.links = []; self.schemas = []; self.title = ""
        self.in_title = False; self.in_schema = False; self.schema_text = ""
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                assert key not in self.meta, f"Duplicate metadata: {key}"
                self.meta[key] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical": self.canonicals.append(a["href"])
        if tag == "a": self.links.append(a.get("href", ""))
        if tag == "title": self.in_title = True
        if tag == "script" and a.get("type") == "application/ld+json": self.in_schema = True

    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.in_schema: self.schema_text += data

    def handle_endtag(self, tag):
        if tag == "title": self.in_title = False
        if tag == "script" and self.in_schema:
            self.schemas.append(json.loads(self.schema_text)); self.schema_text = ""; self.in_schema = False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Also check a running Pages server or deployment")
    args = parser.parse_args()
    titles = set(); social_images = set()

    def read(path, filename=None):
        if not args.base_url: return (ROOT / (filename or path.lstrip("/"))).read_bytes(), None
        req = urllib.request.Request(args.base_url.rstrip("/") + path, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            assert r.status == 200, (path, r.status)
            return r.read(), r.headers.get("Content-Type", "")

    for path, filename in PAGES.items():
        raw, content_type = read(path, filename)
        if content_type: assert "text/html" in content_type
        doc = Document(raw.decode("utf-8"))
        assert doc.canonicals == [CANONICAL + path]
        assert "ITMR Audio" in doc.title and "Plugin" in doc.title
        assert doc.title not in titles; titles.add(doc.title)
        assert 100 <= len(doc.meta["description"]) <= 170
        assert "noindex" not in doc.meta["robots"]
        assert doc.meta["og:url"] == doc.canonicals[0]
        assert doc.meta["og:site_name"] == "ITMR Audio"
        assert doc.meta["og:title"] == doc.title
        assert doc.meta["twitter:card"] == "summary_large_image"
        assert doc.meta["og:image"] == doc.meta["twitter:image"]
        assert doc.meta["og:image"] not in social_images; social_images.add(doc.meta["og:image"])
        img_path = doc.meta["og:image"].removeprefix(CANONICAL)
        image, image_type = read(img_path)
        assert image[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", image[16:24]) == (1200, 630)
        if image_type: assert "image/png" in image_type
        assert doc.meta["og:image:alt"] and doc.meta["twitter:image:alt"]
        assert len(doc.schemas) == 1
        graph = doc.schemas[0]["@graph"]
        ids = [node["@id"] for node in graph]
        assert len(ids) == len(set(ids))
        org = next(n for n in graph if n["@type"] == "Organization")
        assert org["name"] == "ITMR Audio" and org["url"] == CANONICAL + "/"
        assert "sameAs" not in org, "Do not invent official social accounts"
        site = next(n for n in graph if n["@type"] == "WebSite")
        assert site["name"] == "ITMR Audio"
        if path == "/": assert all(p in doc.links for p in ["/arc-vox", "/arc-fx"])
        else:
            app = next(n for n in graph if n["@type"] == "SoftwareApplication")
            assert app["publisher"]["@id"] == org["@id"]
            assert not any(k in app for k in ["offers", "aggregateRating", "review"])
    xml, xml_type = read("/sitemap.xml")
    locs = [e.text for e in ET.fromstring(xml).findall("{*}url/{*}loc")]
    assert set(locs) == {CANONICAL + p for p in PAGES}
    if xml_type: assert "xml" in xml_type
    robots, robots_type = read("/robots.txt")
    assert "Sitemap: " + CANONICAL + "/sitemap.xml" in robots.decode()
    assert "Disallow: /\n" not in robots.decode()
    if robots_type: assert "text/plain" in robots_type
    if args.base_url:
        try:
            read("/not-a-real-seo-page")
            raise AssertionError("Unknown URL must return HTTP 404, not the homepage")
        except urllib.error.HTTPError as e:
            assert e.code == 404
            assert 'name="robots" content="noindex, follow"' in e.read().decode()
        badge, _ = read("/badge")
        assert 'name="robots" content="noindex, follow"' in badge.decode()
    print("PASS: crawler metadata, connected brand/software data, social images, sitemap and robots" + (", live routes and HTTP 404" if args.base_url else ""))


if __name__ == "__main__": main()
