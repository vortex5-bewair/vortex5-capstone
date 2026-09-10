# OWASP ZAP — Web Application Security Headers Pre-Assessment (safe procedure)

This is the runbook for producing **Table 21 — Summary Result of Web Application
Pre-Vulnerability Assessment** for the security-headers portion of the report.

## What this covers

- A **passive** OWASP ZAP scan (Spider + AJAX Spider + Passive Scan) of a **local
  copy** of the stack running against a **throwaway local MongoDB**.
- It never contacts MongoDB Atlas or the Render deployment, so there is nothing to
  break. The database backup in Step 1 is still done — the advisor asked for it, and
  it is the evidence that you snapshotted before touching anything.
- **No Active Scan.** Response headers are on every reply, including 401s, so passive
  scanning finds every missing-header issue. Active Scan sends attack payloads and
  submits forms (create announcement, signup, delete endpoints) — not needed here and
  the reason a backup is required if you ever do run it.

Current state of the app (so you know what to expect): `web/backend/server.js` sets
**no security headers at all** — no `helmet`, no CSP / X-Frame-Options / HSTS /
X-Content-Type-Options / Referrer-Policy / Permissions-Policy — and `cors({ origin:
'*' })`. So every row in `table-21-headers-template.md` is expected to appear.

---

## Prerequisites

| Need | How |
|---|---|
| Node.js 22 | already required by the repo |
| OWASP ZAP + Java 17+ | https://www.zaproxy.org/download/ (the installer bundles a JRE on Windows) |
| A local MongoDB | pick one below |

**Local MongoDB — you very likely already have it.** Check first:

```
mongosh --eval "db.runCommand({ping:1})"
```

If it prints `{ ok: 1 }`, you're done — MongoDB is running on `127.0.0.1:27017` and you
can skip the rest of this box. *(On the current dev machine: MongoDB Server 8.3 +
`mongosh`, confirmed running.)*

Only if that command fails, install one:

- **MongoDB Community Server** — on the Service Configuration screen keep *Install MongoD
  as a Service* checked and *Run service as Network Service user* selected. It then runs
  on `27017` automatically.
- **or Docker:** `docker run -d --name bewair-mongo -p 27017:27017 mongo:7`

`mongosh` (the shell, used in Step 4 / Step 8) ships with the Community Server installer or
as a standalone download.

---

## Step 0 — One-time setup

```
cd web/backend  && npm ci
cd ../frontend  && npm ci
```

Both are needed — the backend to run `db:backup` and the server, the frontend for
`npm run build` / `npm run preview` in Step 3.

Keep a copy of your real `.env` so Step 8 is a file copy, not retyping secrets:

```
copy web\backend\.env web\backend\.env.atlas
```

---

## Step 1 — Back up the real database

With the **normal Atlas `.env`** in `web/backend/.env`:

```
cd web/backend
npm run db:backup
```

This writes `web/backend/backups/<timestamp>/` — one `*.json` per collection plus
`manifest.json`. Open `manifest.json` and check the collection names and document
counts look right. **Keep this folder** — attach it (or a screenshot of the manifest)
as the "database backed up before testing" evidence. It is git-ignored.

> Byte-exact alternative if you have MongoDB Database Tools installed:
> `mongodump --uri "<your MONGO_URI>" --archive=bewair-YYYYMMDD.gz --gzip`

---

## Step 2 — Point the app at a throwaway database

Edit `web/backend/.env` (keep a copy of the real one — e.g. `.env.atlas`):

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/bewair_zaptest
SECRET=zap-local-testing-secret
NODE_ENV=production
```

Leave `MQTT_*`, `BREVO_API_KEY`, `EMAIL_FROM`, `CLOUDINARY_*` **blank**:

- MQTT is optional — `routes/health.js` reports `degraded`, the app still runs.
- Image/video uploads return a clean `503` — fine, not in scope.
- The signup-code / password-reset endpoints need Brevo; you will **exclude** them
  from the scan in Step 5.

Why `NODE_ENV=production`: otherwise Express's default error handler returns stack
traces, which ZAP reports as *Application Error Disclosure* — noise for a
headers-only run.

There is **no "create database" step**. MongoDB brings `bewair_zaptest` into existence
the moment the backend writes its first document — setting `MONGO_URI` and starting the
backend *is* creating the throwaway DB. It shares nothing with Atlas.

Optional — load real-shaped data into the throwaway DB:

```
npm run db:restore backups/<timestamp> --yes
```

(For a headers assessment you only really need one working login — Step 4.)

---

## Step 3 — Run the stack locally

**Backend:**

```
cd web/backend
npm run dev          # http://localhost:4000
```

**Frontend:** build once, then serve it with `preview:secure` — a small local
static server (`web/frontend/serve-secure.mjs`) that applies the same
`public/_headers` Render uses and proxies `/api` + `/uploads` to `localhost:4000`:

```
cd web/frontend
npm run build
npm run preview:secure      # http://localhost:4173
```

Use this rather than plain `npm run preview`: Vite's preview server does **not**
read `public/_headers`, so a scan of it would wrongly report the frontend as
missing CSP / X-Frame-Options / etc. — a false result for a headers assessment.
(Plain `npm run preview` is fine for everything except header checks; its `/api`
proxy also targets `localhost:4000`.)

Open `http://localhost:4173` in a browser and confirm the site loads and talks to the
local backend (Network tab → `/api/...` calls hitting `localhost:4000`).

---

## Step 4 — Create one test admin

So ZAP can crawl authenticated pages. Register through the UI (Sign Up), then promote
the account in the throwaway DB:

```
mongosh "mongodb://127.0.0.1:27017/bewair_zaptest" --eval "db.users.updateOne({ email: 'you@example.com' }, { \$set: { role: 'admin', status: 'active' } })"
```

Log in once through the browser and confirm you reach the admin dashboard.

---

## Step 5 — Configure ZAP safely

1. Start ZAP. Set your browser to use ZAP as its proxy (default
   `127.0.0.1:8080`), or use **Manual Explore** / the **HUD** to launch a
   pre-proxied browser.
2. Browse the whole app while logged in — every page, open the menus, the admin
   pages, the bulletin board, device detail. ZAP records the traffic.
3. **Context & scope** — right-click the site in the *Sites* tree → *Include in
   Context* → *New Context* "BewAir local". Add:
   - `http://localhost:4173.*`
   - `http://localhost:4000.*`

   Then *Session Properties → Context → BewAir local → Include in Context* should list
   only those two. Set the **scope** to this context (the target crosshair button).
4. **Exclude from scan** (belt-and-suspenders even locally) — *Session Properties →
   Exclude from Scan*, or right-click → *Exclude from → Scanner*:
   ```
   .*/api/user/signup/send-code
   .*/api/user/forgot-password
   .*/api/user/reset-password
   .*logout.*
   ```
5. **Run, in this order — passive only:**
   - **Spider** the context, seeded at `http://localhost:4173`.
   - **AJAX Spider** the context (this is a React SPA; the plain spider misses
     client-rendered routes).
   - Wait for **Passive Scan** to finish (the bottom bar shows the queue draining).
   - **Do NOT run Active Scan.**

Passive scanning only reads responses ZAP already captured — it makes no new
attack requests.

---

## Step 6 — Collect the header findings

Open the **Alerts** tab. For this pre-assessment, keep the alerts in these families
(ignore anything else for now — that's a later, broader assessment):

- Content Security Policy (CSP) Header Not Set
- Missing Anti-clickjacking Header (X-Frame-Options / `frame-ancestors`)
- X-Content-Type-Options Header Missing
- Strict-Transport-Security Header Not Set *(see caveat below)*
- Permissions Policy Header Not Set
- Server Leaks Information via `X-Powered-By` / `Server` Response Header
- Cross-Domain Misconfiguration (`Access-Control-Allow-Origin: *`)
- Re-examine Cache-control Directives / Storable and Cacheable Content
- Absence of Anti-CSRF Tokens
- Vulnerable JS Library (Retire.js)
- Information Disclosure – Suspicious Comments

For each alert, note the **Risk** and the **number of instances** (URLs affected) —
shown in the alert detail pane and in the generated report.

Export: **Report → Generate Report…** → *Traditional HTML Report* (or PDF), or
**Report → Export Alerts → CSV**.

---

## Step 7 — Fill Table 21

| Table 21 column | ZAP field |
|---|---|
| Application Risk (Name) | Alert **name** |
| Severity (Risk Level) | Alert **Risk** — High / Medium / Low / Informational |
| Number of Instances (Count) | Alert **Instances** count |

Use `docs/security/table-21-headers-template.md` as the row list and drop your real
numbers into the Count column. If a templated row didn't appear in your scan, say so
(scope/version difference) rather than inventing a number; if a row appeared that
isn't in the template, add it.

---

## Step 8 — Clean up

1. Stop ZAP. Stop `npm run dev` and `npm run preview`.
2. Drop the throwaway DB:
   ```
   mongosh "mongodb://127.0.0.1:27017/bewair_zaptest" --eval "db.dropDatabase()"
   ```
   (or `docker rm -f bewair-mongo` if you used the Docker option.)
3. Restore the real `.env`: `copy web\backend\.env.atlas web\backend\.env`.
4. Sanity check nothing upstream changed: `npm run db:backup` again against Atlas and
   compare `manifest.json` counts to the Step 1 backup — they should match.

Atlas and Render were never in the loop; the ZAP *Sites* tree should show only
`localhost` entries.

---

## Caveats to record in the write-up

- **HSTS:** `Strict-Transport-Security` only flags over HTTPS. A localhost `http`
  scan will **not** raise it, but it is genuinely missing — it will show if you later
  passively scan the live `https://vortex5-capstone.onrender.com`. Note it as
  "expected on production" if it doesn't appear locally.
- **`Server` header:** locally Express sends none; on Render the proxy may add one.
  The `X-Powered-By: Express` leak is present in both.
- This is a **pre**-assessment (baseline). The remediation — add `helmet`, replace
  `cors({origin:'*'})` with an allowlist, `app.disable('x-powered-by')`,
  `Cache-Control: no-store` on `/api` — is a separate change, after which you re-run
  this same procedure for the "post" column.
