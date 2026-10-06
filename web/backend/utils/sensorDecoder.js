// Decode an FS00905B UART frame from a hex string into a metrics object.
// Frame format (per manufacturer manual):
//   [0..1]   header 0x42 0x4D
//   [2..3]   length (big-endian) = 2*N + 2 where N = number of data words
//   [4..]    N data words (each big-endian uint16)
//   [last 2] checksum = sum of all bytes from index 0 to (total - 3) inclusive

function decodeFrame(hexFrame) {
  const bytes = Buffer.from(hexFrame, 'hex')

  if (bytes.length < 6) throw new Error('frame too short')
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4D) throw new Error('bad header')

  const lengthField = bytes.readUInt16BE(2)
  const total = 4 + lengthField
  if (total !== bytes.length) throw new Error(`length mismatch: declared ${total}, got ${bytes.length}`)

  let sum = 0
  for (let i = 0; i < total - 2; i++) sum += bytes[i]
  const checksum = bytes.readUInt16BE(total - 2)
  if (sum !== checksum) throw new Error('checksum mismatch')

  // 17 data words for FS00905B
  const word = (n) => bytes.readUInt16BE(4 + (n - 1) * 2)
  const numWords = (lengthField - 2) / 2  // length includes checksum

  // Debug mode: log raw hex + every word so we can verify field offsets.
  // Toggle by setting DEBUG_SENSOR=1 in env, or remove this block once stable.
  if (process.env.DEBUG_SENSOR === '1') {
    const allWords = []
    for (let i = 1; i <= numWords; i++) allWords.push(`w${i}=${word(i)}`)
    console.log(`[sensor] raw hex: ${hexFrame}`)
    console.log(`[sensor] numWords=${numWords} | ${allWords.join(' ')}`)
  }

  const raw = {
    // word(1..3) CF=1 standard PM — often reads 0 on real units
    PM1:          word(4),                  // atmospheric PM (real reading)
    PM25:         word(5),
    PM10:         word(6),
    // word(7..12) particle counts — skipped
    TVOC:         word(13),                 // µg/m³
    // Offset recalibrated 500 (was 450, uncited since the file's first
    // commit) against a reference Sonoff temperature sensor.
    Temperature:  (word(14) - 500) / 10,    // °C, supports negative values
    Humidity:     word(15) / 10,            // %RH
    CO2:          word(16),                 // ppm
    Formaldehyde: word(17)                  // µg/m³
  }

  // Sanity-check each field. Out-of-range values mean the word offsets are
  // wrong or the sensor is not yet warmed up. Log a warning but still return
  // the raw values so callers can decide what to do with them.
  const RANGES = {
    PM1:          [0, 1000],
    PM25:         [0, 1000],
    PM10:         [0, 1000],
    TVOC:         [0, 60000],
    Temperature:  [-20, 80],
    Humidity:     [0, 100],
    CO2:          [300, 65000],
    Formaldehyde: [0, 5000],
  }

  for (const [field, [lo, hi]] of Object.entries(RANGES)) {
    const v = raw[field]
    if (v < lo || v > hi || !isFinite(v)) {
      console.warn(`[sensor] ${field} out of expected range: ${v} (expected ${lo}–${hi}) — check word offsets`)
    }
  }

  return raw
}

module.exports = { decodeFrame }
