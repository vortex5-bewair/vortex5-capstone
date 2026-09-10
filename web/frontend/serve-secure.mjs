// Local static server that serves the production build (dist/) WITH the same
// response headers Render applies from public/_headers, and proxies /api and
// /uploads to the local backend (mirrors public/_redirects).
//
// Vite's own `npm run preview` does NOT read public/_headers, so a local scan
// would wrongly show the frontend as missing CSP / X-Frame-Options / etc. Use
// this instead when running OWASP ZAP against a local copy.
//
//   npm run build
//   node serve-secure.mjs            # http://localhost:4173  (backend must be on :4000)
//
// Local-only helper — not used in production.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('./dist', import.meta.url))
const HEADERS_FILE = fileURLToPath(new URL('./public/_headers', import.meta.url))
const PORT = 4173
const BACKEND = 'http://localhost:4000'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
}

// Parse the "/*" block of public/_headers into a flat { name: value } map.
// Tolerant of CRLF and of comment / blank lines.
const staticHeaders = {}
try {
  const lines = (await readFile(HEADERS_FILE, 'utf8')).split(/\r?\n/)
  let inWildcard = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('#') || line.trim() === '') continue
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      inWildcard = line.trim() === '/*'
      continue
    }
    const m = inWildcard && line.match(/^\s+([A-Za-z][A-Za-z-]*):\s*(.+)$/)
    if (m) staticHeaders[m[1]] = m[2].trim()
  }
  console.log('applying headers from public/_headers:', Object.keys(staticHeaders).join(', ') || '(none parsed!)')
} catch (e) {
  console.warn('could not read public/_headers:', e.message)
}

const server = createServer(async (req, res) => {
  // Proxy API + uploads to the backend, same as Render's _redirects.
  if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
    try {
      const upstream = await fetch(BACKEND + req.url, {
        method: req.method,
        headers: { ...req.headers, host: new URL(BACKEND).host },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half',
      })
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers))
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      res.writeHead(502).end('backend not reachable on :4000')
    }
    return
  }

  for (const [k, v] of Object.entries(staticHeaders)) res.setHeader(k, v)

  // Static file, else SPA fallback to index.html.
  let path = normalize(join(ROOT, decodeURIComponent(req.url.split('?')[0])))
  if (!path.startsWith(ROOT)) return res.writeHead(403).end('forbidden')
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
  } catch {
    path = join(ROOT, 'index.html')
  }
  try {
    const body = await readFile(path)
    res.setHeader('Content-Type', MIME[extname(path)] || 'application/octet-stream')
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}  (proxying /api -> ${BACKEND})`))
