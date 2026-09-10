# Table 21 — Summary Result of Web Application Pre-Vulnerability Assessment (Security Headers)

**Target:** local copy of BewAir (`http://localhost:4173` frontend, `http://localhost:4000`
API) against a throwaway MongoDB
**Tool:** OWASP ZAP `<version>` — Spider + AJAX Spider + Passive Scan (no Active Scan)
**Date:** `<yyyy-mm-dd>`  **Tester:** `<name>`
**Database backup taken before testing:** `web/backend/backups/<timestamp>/` ✔

> Fill the **Count** column from your ZAP run (Alerts tab → Instances, or the generated
> report). The rows below are what this codebase is expected to produce — verified against
> `web/backend/server.js` (no `helmet`, no header middleware, `cors({ origin: '*' })`,
> `X-Powered-By` left on). Treat the real scan's names / severities / counts as
> authoritative: drop rows that didn't appear, add rows that did.

| # | Application Risk (Name) | Severity (Risk Level) | Number of Instances (Count) |
|---|---|---|---|
| 1 | Content Security Policy (CSP) Header Not Set | Medium | _(from scan)_ |
| 2 | Missing Anti-clickjacking Header (X-Frame-Options / `frame-ancestors`) | Medium | _(from scan)_ |
| 3 | Cross-Domain Misconfiguration (`Access-Control-Allow-Origin: *`) | Medium | _(from scan)_ |
| 4 | X-Content-Type-Options Header Missing | Low | _(from scan)_ |
| 5 | Strict-Transport-Security Header Not Set *(HTTPS scan only — see caveat)* | Low | _(from scan)_ |
| 6 | Permissions Policy Header Not Set | Low | _(from scan)_ |
| 7 | Server Leaks Information via `X-Powered-By` HTTP Response Header | Low | _(from scan)_ |
| 8 | Absence of Anti-CSRF Tokens | Low | _(from scan)_ |
| 9 | Re-examine Cache-control Directives / Storable and Cacheable Content | Informational–Low | _(from scan)_ |
| 10 | Vulnerable JS Library (Retire.js) — if a bundled library is flagged | Medium | _(from scan)_ |
| 11 | Information Disclosure – Suspicious Comments (frontend bundle) | Informational | _(from scan)_ |
| 12 | Modern Web Application | Informational | _(from scan)_ |
| | **Total instances** | | _(sum)_ |

## What each row means and the fix

| Risk | Meaning | Fix (remediation task, not this round) |
|---|---|---|
| CSP Header Not Set | No `Content-Security-Policy`, so the browser has no policy limiting where scripts/styles/frames may load from — weak defence-in-depth against XSS. | `helmet.contentSecurityPolicy({ directives: … })` tuned to the app's origins (self, Cloudinary, Google Fonts). |
| Missing Anti-clickjacking Header | No `X-Frame-Options` / CSP `frame-ancestors`, so the app can be framed by another site (clickjacking). | `helmet.frameguard({ action: 'deny' })` or CSP `frame-ancestors 'none'`. |
| Cross-Domain Misconfiguration | `Access-Control-Allow-Origin: *` — any website's JS may call the API. | Replace `cors({ origin: '*' })` with an allowlist: the Render frontend origin + the mobile app. |
| X-Content-Type-Options Missing | No `nosniff`, so browsers may MIME-sniff responses and execute non-scripts as scripts. | `helmet.noSniff()` (`X-Content-Type-Options: nosniff`). |
| Strict-Transport-Security Not Set | No HSTS, so a first request can be downgraded to HTTP / stripped. Only detectable over HTTPS. | `helmet.hsts({ maxAge: 15552000, includeSubDomains: true })` — set once TLS is confirmed everywhere. |
| Permissions Policy Not Set | No `Permissions-Policy`, so no explicit opt-out of camera / geolocation / etc. for the app and any frames. | `helmet.permittedCrossDomainPolicies()` + a `Permissions-Policy` header disabling unused features. |
| `X-Powered-By` leak | Express advertises itself in every response, easing fingerprinting. | `app.disable('x-powered-by')` (helmet also removes it). |
| Absence of Anti-CSRF Tokens | Forms have no anti-CSRF token. Impact here is low — the API authenticates with a bearer token in the `Authorization` header, not an ambient cookie — but ZAP flags the pattern. | Note the bearer-token design in the report; add tokens if any cookie-based auth is introduced. |
| Cache-control directives | API JSON responses have no `Cache-Control`, so a shared cache/browser may store authenticated data. | `Cache-Control: no-store` on `/api` responses. |
| Vulnerable JS Library | Retire.js matched a bundled front-end dependency against a known-CVE list. | Upgrade the flagged package; re-run `npm audit`. |
| Suspicious Comments / Modern Web Application | Informational — ZAP saw developer comments in the JS bundle / detected a SPA. | No action; acknowledge. |

## Caveats

- **Local `http` scan** will not raise **HSTS** (row 5) — it is still missing; mark it
  "expected on production" and confirm with a passive scan of the live HTTPS URL.
- Row 10 (Retire.js) and row 12 depend on the exact ZAP version and add-on data — include
  them only if your scan actually reported them.
- Instance counts scale with how many URLs the spider reached — record the spider's URL
  count alongside the table so the numbers are reproducible.
