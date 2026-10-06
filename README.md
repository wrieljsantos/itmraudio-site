# ITMR Audio website

Static product site for Arc Vox and Arc Fx. The public root currently serves the
coming-soon page. The prior full landing page remains recoverable from Git
history when it is time to launch.

## Early-access signups

`POST /api/signup` stores normalized, unique addresses in the Cloudflare D1
database `itmraudio-signups`. The Pages binding is named `SIGNUPS`.

Export the current list from an authenticated terminal:

```powershell
npx wrangler d1 execute itmraudio-signups --remote --command "SELECT email, locale, consented_at, status FROM subscribers ORDER BY consented_at DESC"
```

The signup endpoint stores no IP address or user-agent data. Duplicate signups
return success without creating a second record.

## Local check

Run the responsive smoke test from the project root:

```powershell
& 'C:\Users\Wriel Santos\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'tests\site_smoke.py'
```

The test opens the static files directly and checks the homepage plus both product pages at desktop and mobile sizes.

## Search and social identity

Use **ITMR Audio** for the company and **ARC VOX by ITMR Audio** / **ARC FX by ITMR Audio**
for products. Bare "ITMR" overlaps with a recording artist. The site describes
audio software, with one Organization identity connected to its WebSite and applications.
No artist profiles, invented ratings, prices, or unverified social handles are used.

Canonical public URLs are `https://itmraudio.com/`, `/arc-vox`, and `/arc-fx`.
Cloudflare redirects `.html` URLs to these clean paths. The same canonical metadata
consolidates the www and Pages-hosted copies. `sitemap.xml` lists only those pages;
`robots.txt` advertises it. The prototype badge is noindex, and `404.html` prevents
Cloudflare's implicit homepage fallback for nonexistent URLs.

Static metadata lives in `tools/build_seo.py`; run it after editing titles,
descriptions, or brand data. It writes the marked head blocks and sitemap.
Social preview cards are 1200 x 630 PNGs rendered from `tools/social-cards.html`
with `tools/render_social.py`. Original UI artwork is preserved. The page's
animated analyzers are independent of the static share previews.

Validation:

```powershell
python tools/build_seo.py
python tools/render_social.py
python tests/seo_check.py
python tests/seo_check.py --base-url https://itmraudio.com
# Use a local Pages dev URL in SITE_BASE_URL for responsive browser checks.
$env:SITE_BASE_URL = 'http://localhost:8788'
python tests/site_smoke.py
```

The homepage includes the Google verification tag for the owner’s URL-prefix
property. Keep this tag in place when changing metadata. After deployment, submit
`https://itmraudio.com/sitemap.xml`, and request indexing of the three canonical
pages. Indexing and rankings are controlled by the search engine, not this build.
When official social accounts are created, link them visibly and add only those
verified URLs to Organization.sameAs. Use a consistent bio such as:
"ITMR Audio makes vocal-processing and creative-effects plugins for independent
artists. Makers of ARC VOX and ARC FX. Early access at itmraudio.com."
