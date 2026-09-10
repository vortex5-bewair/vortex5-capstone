# Security Headers — Remediation (post-assessment)

Fixes for the findings in `table-21-headers-template.md` / the ZAP + securityheaders.com
pre-assessment. Changes live in this PR; nothing is deployed until it is merged and Render
redeploys.

## Where each header comes from

| Surface | URL | How headers are set |
|---|---|---|
| API / backend | `vortex5-capstone.onrender.com` | `helmet` + explicit middleware in `web/backend/server.js` |
| Web frontend (static) | `bewair.onrender.com` | `web/frontend/public/_headers` (ships to `dist/_headers`) |

## Finding → fix

| # | Finding | Severity | Fix | Status |
|---|---|---|---|---|
| 1 | Content Security Policy (CSP) Header Not Set | Medium | API: `default-src 'none'` (JSON only). Frontend: full CSP scoped to the app's real origins (self, Google Fonts, Cloudinary, legacy `/uploads` host); `script-src 'self'`, `style-src` allows `'unsafe-inline'` for MUI/emotion. | **Fixed** |
| 2 | Cross-Domain Misconfiguration (`Access-Control-Allow-Origin: *`) | Medium | `cors()` changed from `origin: '*'` to an allowlist (`bewair.onrender.com` + localhost dev). Requests with no `Origin` (native mobile, health checks) still pass. | **Fixed** |
| 3 | Missing Anti-clickjacking Header | Medium | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on both surfaces. | **Fixed** |
| 4 | Sub Resource Integrity Attribute Missing | Medium | The `<link>` to the Google Fonts stylesheet in `index.html` has no `integrity` hash. Google serves UA-specific CSS, so a static SRI hash isn't possible. Options: self-host the two font families, or accept. | **Accepted** (self-hosting recommended as a follow-up) |
| 5 | Application Error Disclosure | Low | Added a 404 handler + a central error handler in `server.js` that logs the detail server-side and returns a generic `{ error: 'Internal server error' }`. Also: set `NODE_ENV=production` in Render (see below). | **Fixed** (code) + **1 manual step** |
| 6 | Server Leaks Information via `X-Powered-By` | Low | `app.disable('x-powered-by')` + helmet removes it. | **Fixed** |
| 7 | Strict-Transport-Security Header Not Set | Low | `Strict-Transport-Security: max-age=31536000; includeSubDomains` on the API (the frontend already had it). | **Fixed** |
| 8 | Timestamp Disclosure - Unix | Low | The flagged values are legitimate `createdAt` / `updatedAt` epoch fields in JSON responses, not a secret. No fix; documented as a false positive. | **Accepted** |
| 9 | X-Content-Type-Options Header Missing | Low | `X-Content-Type-Options: nosniff` on the API (frontend already had it). | **Fixed** |
| 10 | Referrer-Policy not set (securityheaders.com) | Low | `Referrer-Policy: no-referrer` on both surfaces. | **Fixed** |
| 11 | Permissions-Policy not set (securityheaders.com) | Low | `Permissions-Policy` on the frontend disabling camera, mic, geolocation, USB, payment, etc. | **Fixed** |
| — | Authentication Request Identified / Session Management Response Identified / Modern Web Application / Suspicious Comments / Retrieved from Cache | Informational | Observations, not weaknesses. "Retrieved from Cache" is additionally mitigated by `Cache-Control: no-store` now set on all `/api` responses. | **No action** |

## Manual steps before / after merge

1. **Render → backend service → Environment:** add `NODE_ENV=production` (if not already
   set). This stops Express from putting stack traces in error responses and is the other
   half of finding #5.
2. **Preferably deploy this to a Render preview first** and click through the whole web app
   with the browser console open. If anything fails to load (an image, a font, a chart, PDF
   export), it will show a CSP violation in the console naming the blocked URL — add that
   origin to the matching directive in `web/frontend/public/_headers`.
   - Can't use a preview? Change `Content-Security-Policy` to
     `Content-Security-Policy-Report-Only` in `_headers` for one deploy, verify the console
     is clean across every page, then change it back.
3. **Re-run the scan** (same steps as `zap-headers-pre-assessment.md`) to produce the
   "post" column: findings 1, 3, 6, 7, 9, 10, 11 should be gone; 2 gone; 5 gone once
   `NODE_ENV=production` is live; 4 and 8 remain as accepted.

## Not in this PR (noted for the full assessment)

- **User enumeration:** `POST /api/user/login` returns `"Incorrect password"` vs a
  not-found message, revealing which emails have accounts. Make the failure message
  identical for both cases.
- **No login lockout:** only the email-code endpoints are rate-limited; `loginUser` has no
  per-account throttle.
- Controllers that still return `err.message` in 500 responses — lower impact than a stack
  trace, but worth normalising to the generic handler.
