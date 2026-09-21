import { airQualityFields, componentInsight, readableInsightColor } from './airQualityGuidance'

// The five headline readings the public snapshot carries, in display order.
// `key` matches both the /api/public/landing metrics keys and the short keys
// componentInsight() uses, so a chip's colour comes from the same served band
// table as every other screen (never a threshold hardcoded here). `field` is the
// canonical sensor field name, used only to look up the unit the system uses.
const CHIP_DEFS = [
  { key: 'pm25', field: 'PM25', label: 'PM2.5' },
  { key: 'co2', field: 'CO2', label: 'CO₂' },
  { key: 'tvoc', field: 'TVOC', label: 'TVOC' },
  { key: 'temp', field: 'Temperature', label: 'TEMP' },
  { key: 'humidity', field: 'Humidity', label: 'RH' },
]

// Same rule AqiDetails uses (whole numbers as-is, otherwise 1 decimal), plus a
// thousands separator so 1150 reads "1,150".
const formatReading = (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1))

/** Chips for one room / the headline. `metrics` may be null → placeholder dashes. */
export function chipsFor(metrics) {
  const units = Object.fromEntries(airQualityFields().map((f) => [f.key, f.unit]))
  return CHIP_DEFS.map(({ key, field, label }) => {
    const raw = metrics?.[key]
    const has = typeof raw === 'number' && Number.isFinite(raw)
    const insight = has ? componentInsight(key, raw) : null
    return {
      key,
      label,
      unit: units[field] || '',
      value: has ? formatReading(raw) : '--',
      // The served band colour, darkened where needed to pass 4.5:1 as text on white.
      color: insight ? readableInsightColor(insight.color, false) : null,
    }
  })
}

/** "7:10 PM" */
export const formatClock = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** "Sep 10, 7:58 PM" */
export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
