# ITMR Audio website

Static product site for Arc Vox and Arc Fx. The public root currently serves the
coming-soon page; the complete product-site draft is retained at
`full-site.html` for later launch.

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
