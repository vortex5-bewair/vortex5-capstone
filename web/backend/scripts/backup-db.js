// Logical backup / restore of the whole database, one Extended-JSON file per
// collection. Pure Node + the driver already in node_modules — no mongodump
// binary to install (that ships separately as "MongoDB Database Tools").
//
// Use this before an OWASP ZAP scan, a destructive migration, or any bulk
// edit. See docs/security/zap-headers-pre-assessment.md.
//
//   node scripts/backup-db.js                         # dump every collection
//   node scripts/backup-db.js --exclude aqis          # skip big time-series
//   node scripts/backup-db.js restore backups/<dir>          # dry run, shows plan
//   node scripts/backup-db.js restore backups/<dir> --yes    # drop + reinsert
//
// Extended JSON keeps ObjectId / Date / etc. intact, so _id values and refs
// survive a round trip. Indexes are NOT dumped — the Mongoose models rebuild
// them on the next server boot.
//
// Byte-exact alternative (needs MongoDB Database Tools on PATH):
//   mongodump    --uri "$MONGO_URI" --archive=bewair-YYYYMMDD.gz --gzip
//   mongorestore --uri "$MONGO_URI" --archive=bewair-YYYYMMDD.gz --gzip --drop

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

let EJSON
try {
  EJSON = require('bson').EJSON
} catch (_) {
  EJSON = require('mongodb').BSON.EJSON
}

const BACKUP_ROOT = path.join(__dirname, '..', 'backups')
const INSERT_CHUNK = 1000

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function requireUri() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Run this from web/backend with .env in place.')
    process.exit(1)
  }
  return process.env.MONGO_URI
}

function target() {
  // Prefer what the live connection reports; fall back to parsing the URI.
  const host = mongoose.connection.host
  const db = mongoose.connection.name
  if (host && db) return `${host}/${db}`
  try {
    const u = new URL(process.env.MONGO_URI)
    return `${u.hostname}${u.pathname || ''}`
  } catch (_) {
    return '(unknown)'
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function listCollections() {
  const raw = await mongoose.connection.db.listCollections().toArray()
  return raw
    .filter((c) => c.type === 'collection' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort()
}

async function dump() {
  const uri = requireUri()
  const exclude = new Set((valueOf('--exclude') || '').split(',').map((s) => s.trim()).filter(Boolean))

  await mongoose.connect(uri)
  console.log('connected to', target(), '\n')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(BACKUP_ROOT, stamp)
  fs.mkdirSync(outDir, { recursive: true })

  const names = await listCollections()
  const manifest = {
    host: mongoose.connection.host || null,
    db: mongoose.connection.name || null,
    timestamp: stamp,
    tool: 'scripts/backup-db.js',
    collections: [],
  }
  let totalBytes = 0

  for (const name of names) {
    if (exclude.has(name)) {
      console.log(`  skip   ${name}  (--exclude)`)
      continue
    }
    const docs = await mongoose.connection.db.collection(name).find({}).toArray()
    const json = EJSON.stringify(docs, null, 2, { relaxed: false })
    fs.writeFileSync(path.join(outDir, `${name}.json`), json)
    const bytes = Buffer.byteLength(json)
    totalBytes += bytes
    manifest.collections.push({ name, count: docs.length, bytes })
    console.log(`  dump   ${name.padEnd(24)} ${String(docs.length).padStart(7)} docs   ${humanSize(bytes)}`)
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log('\n=== backup complete ===')
  console.log('location   :', outDir)
  console.log('collections:', manifest.collections.length)
  console.log('total size :', humanSize(totalBytes))

  await mongoose.disconnect()
}

async function restore() {
  const uri = requireUri()
  const dir = argv[1] && !argv[1].startsWith('--') ? path.resolve(argv[1]) : null
  const confirmed = has('--yes')

  if (!dir || !fs.existsSync(dir)) {
    console.error('Usage: node scripts/backup-db.js restore <backup-dir> [--yes]')
    process.exit(1)
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  if (files.length === 0) {
    console.error('No collection JSON files found in', dir)
    process.exit(1)
  }

  await mongoose.connect(uri)

  console.log('\nrestore source :', dir)
  console.log('restore target :', target(), confirmed ? '' : '  (DRY RUN)')
  console.log('')

  for (const file of files) {
    const name = path.basename(file, '.json')
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    console.log(`  ${confirmed ? 'drop + insert' : 'would drop + insert'}  ${name.padEnd(24)} ${String(docs.length).padStart(7)} docs`)

    if (!confirmed) continue

    const coll = mongoose.connection.db.collection(name)
    try {
      await coll.drop()
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound') throw err
    }
    for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
      await coll.insertMany(docs.slice(i, i + INSERT_CHUNK), { ordered: false })
    }
  }

  if (!confirmed) {
    console.log('\nDry run — nothing changed. Re-run with --yes to apply.')
  } else {
    console.log('\n=== restore complete ===')
  }

  await mongoose.disconnect()
}

const cmd = argv[0] === 'restore' ? restore : dump
cmd().catch(async (err) => {
  console.error('\nfailed:', err.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
