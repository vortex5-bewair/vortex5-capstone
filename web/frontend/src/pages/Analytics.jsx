import { useEffect, useMemo, useState } from 'react'
import {
  Box, Card, CardContent, Typography, Grid, FormControl, InputLabel, Select,
  MenuItem, Switch, FormControlLabel, CircularProgress, Alert, Button, Chip,
  Table, TableBody, TableCell, TableHead, TableRow, CssBaseline, Tooltip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { DataGrid } from '@mui/x-data-grid'

import { Download, Activity, Radio, AlertTriangle } from 'lucide-react'
import jsPDF from 'jspdf'
import { useAuthContext } from '../hooks/useAuthContext'
import { useTheme as useAppTheme } from '../hooks/useTheme'
import {
  CATEGORY_COLORS,
  airQualityCategories,
  airQualityLimits,
  airQualitySource,
  categoryNote,
} from '../utils/airQualityGuidance'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const RANGE_STORAGE_KEY = 'bewair_analytics_range'

// Reads the last range someone picked, so a page refresh keeps showing it
// instead of quietly reverting to the default. Returns null on anything
// missing, corrupted, or invalid — callers fall through to the default range.
function loadStoredRange() {
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY)
    if (!raw) return null
    const { from: f, to: t } = JSON.parse(raw)
    const from = dayjs(f)
    const to = dayjs(t)
    if (!from.isValid() || !to.isValid()) return null
    return { from, to }
  } catch {
    return null
  }
}

// Pollutant metadata: label + unit for tables and charts.
const POLLUTANTS = [
  { key: 'Aqi', label: 'AQI', unit: '' },
  { key: 'PM25', label: 'PM 2.5', unit: 'µg/m³' },
  { key: 'PM10', label: 'PM 10', unit: 'µg/m³' },
  { key: 'PM1', label: 'PM 1.0', unit: 'µg/m³' },
  { key: 'CO2', label: 'CO₂', unit: 'ppm' },
  { key: 'TVOC', label: 'TVOC', unit: 'µg/m³' },
  { key: 'Formaldehyde', label: 'HCHO', unit: 'µg/m³' },
  { key: 'Temperature', label: 'Temp', unit: '°C' },
  { key: 'Humidity', label: 'Humidity', unit: '%' },
]

const METRIC_OPTIONS = [
  { value: 'aqi', label: 'AQI', unit: '' },
  { value: 'pm25', label: 'PM 2.5', unit: 'µg/m³' },
  { value: 'pm10', label: 'PM 10', unit: 'µg/m³' },
  { value: 'co2', label: 'CO₂', unit: 'ppm' },
  { value: 'tvoc', label: 'TVOC', unit: 'µg/m³' },
  { value: 'hcho', label: 'HCHO', unit: 'µg/m³' },
  { value: 'temp', label: 'Temperature', unit: '°C' },
  { value: 'humidity', label: 'Humidity', unit: '%' },
]

const FIELD_LABELS = {
  Aqi: 'AQI', PM1: 'PM 1.0', PM25: 'PM 2.5', PM10: 'PM 10', CO2: 'CO₂',
  TVOC: 'TVOC', Formaldehyde: 'HCHO', Temperature: 'Temperature', Humidity: 'Humidity',
}

const FIELD_UNITS = {
  Aqi: '', PM1: 'µg/m³', PM25: 'µg/m³', PM10: 'µg/m³', CO2: 'ppm',
  TVOC: 'µg/m³', Formaldehyde: 'µg/m³', Temperature: '°C', Humidity: '%',
}

// Map a trend metric to its pollutant field (for threshold lines).
const METRIC_TO_FIELD = {
  aqi: 'Aqi', pm25: 'PM25', pm10: 'PM10', co2: 'CO2', tvoc: 'TVOC', hcho: 'Formaldehyde',
}

// Per-bucket "driver" for the trend table: whichever field is furthest over
// its own limit, mirroring the worstField/driver concept RoomRow already
// uses at the device level — computed client-side, no new backend data.
const BUCKET_DRIVER_FIELDS = [
  { key: 'pm25', field: 'PM25', label: 'PM 2.5' },
  { key: 'pm10', field: 'PM10', label: 'PM 10' },
  { key: 'co2', field: 'CO2', label: 'CO₂' },
  { key: 'tvoc', field: 'TVOC', label: 'TVOC' },
  { key: 'hcho', field: 'Formaldehyde', label: 'HCHO' },
]
const bucketDriver = (bucket, limits) => {
  let best = null
  for (const f of BUCKET_DRIVER_FIELDS) {
    const val = bucket[f.key]
    const limit = limits[f.field]
    if (val == null || !limit) continue
    const ratio = val / limit
    if (!best || ratio > best.ratio) best = { ratio, label: f.label }
  }
  return best && best.ratio > 1 ? best.label : '—'
}

// Format an hour (0-23) as "6 AM" / "12 PM".
const hourLabel = (h) => {
  const period = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${period}`
}

// Category colours are the standard's own, so a chart band has to be the same
// hue as the pill and the Thresholds page. Only the alpha changes.
const hexToRgba = (hex, alpha) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(148,163,184,${alpha})`
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

const fmtHours = (h) => (h == null ? '—' : h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h)))

// Local hour + Mongo-style day-of-week (Sun=1..Sat=7, matching $dayOfWeek and
// SCHOOL_HOURS.days) for an arbitrary IANA zone, without a dayjs-timezone
// dependency. Used to mirror the backend's own schoolHoursStages() $match
// entirely client-side, so a gap can be classified as "excluded by the
// school-hours filter" vs "genuinely missing" from timestamps alone.
const DOW_FROM_ABBR = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 }
const tzHourAndDow = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', hour: 'numeric', weekday: 'short',
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? date.getHours())
  const dow = DOW_FROM_ABBR[parts.find((p) => p.type === 'weekday')?.value] ?? null
  return { hour, dow }
}

// Read the app's own CSS tokens so MUI and the rest of the dashboard share one
// palette. The previous version hardcoded its own near-blacks, which is how a
// page ends up not quite matching the app it lives in.
const cssVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const buildMuiTheme = (isDark) => createTheme({
  palette: {
    mode: isDark ? 'dark' : 'light',
    primary: { main: cssVar('--color-accent', '#7c3aed') },
    background: {
      default: cssVar('--color-bg', isDark ? '#0c1117' : '#f6f8fb'),
      paper: cssVar('--color-surface', isDark ? '#161c24' : '#ffffff'),
    },
    text: {
      primary: cssVar('--color-text-primary', isDark ? '#f1f5f9' : '#0f172a'),
      secondary: cssVar('--color-text-secondary', isDark ? '#94a3b8' : '#475569'),
    },
    divider: cssVar('--color-border', isDark ? '#2a3441' : '#e2e8f0'),
  },
  typography: { fontFamily: 'var(--font-sans, "Inter", system-ui, sans-serif)' },
  shape: { borderRadius: 10 },
  components: {
    MuiCard: { styleOverrides: { root: { border: '1px solid', borderColor: cssVar('--color-border', '#e2e8f0'), boxShadow: 'none' } } },
  },
})

// ---------------------------------------------------------------------------

const Analytics = () => {
  const { user } = useAuthContext()
  const { isDark } = useAppTheme()
  const muiTheme = useMemo(() => buildMuiTheme(isDark), [isDark])
  const isAdmin = user && user.role === 'admin'

  // Range persists across a refresh (localStorage) rather than recomputing
  // "now" on every mount — otherwise every reload silently snapped back to a
  // fresh default and any range someone picked was gone. A stored range with
  // no valid dates in it (corrupted, or from before this existed) falls
  // through to the 24-hour default below.
  const [from, setFrom] = useState(() => loadStoredRange()?.from ?? dayjs().subtract(24, 'hour'))
  const [to, setTo] = useState(() => loadStoredRange()?.to ?? dayjs())

  useEffect(() => {
    try {
      localStorage.setItem(
        RANGE_STORAGE_KEY,
        JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
      )
    } catch {
      // Private browsing / storage disabled — the range just won't survive
      // a refresh this session, which is the pre-existing behaviour.
    }
  }, [from, to])

  const [deviceId, setDeviceId] = useState('all')
  const [metric, setMetric] = useState('aqi')
  const [trendView, setTrendView] = useState('chart')
  const [granularity, setGranularity] = useState('auto')
  const [schoolHours, setSchoolHours] = useState(true)

  const [devices, setDevices] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const rangeHours = useMemo(() => Math.max(1, to.diff(from, 'hour')), [from, to])

  // Live polling refetches ten aggregations over the whole range. That is cheap
  // for a few hours and wasteful for a month, so it is only offered on short
  // ranges and its interval grows with the range.
  const liveAllowed = rangeHours <= 24
  const [liveMode, setLiveMode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => { if (!liveAllowed && liveMode) setLiveMode(false) }, [liveAllowed, liveMode])

  const categories = airQualityCategories()
  // Top of the served AQI scale (the last category's ceiling), for drawing the
  // Average AQI tile's proportion bar against the real DENR range rather than
  // an arbitrary cutoff.
  const aqiScaleMax = categories[categories.length - 1]?.max

  const ec = useMemo(() => ({
    axis: cssVar('--color-border', isDark ? '#3a4654' : '#cbd5e1'),
    label: cssVar('--color-text-tertiary', isDark ? '#94a3b8' : '#64748b'),
    split: cssVar('--color-border-subtle', isDark ? '#2a3441' : '#eef2f6'),
    text: cssVar('--color-text-primary', isDark ? '#f1f5f9' : '#0f172a'),
    tooltipBg: cssVar('--color-surface', isDark ? '#1a212b' : '#ffffff'),
    tooltipBorder: cssVar('--color-border', isDark ? '#2a3441' : '#e2e8f0'),
    line: cssVar('--color-accent', '#7c3aed'),
  }), [isDark])

  // Lookup of pollutant limits from the exceedance data (field -> limit).
  const limits = useMemo(() => {
    // Start from the served limit set, which carries the two-sided fields as
    // TemperatureMin/Max and HumidityMin/Max. The exceedance rows only ever
    // held the one-sided fields, so looking Temperature up in them returned
    // undefined and the stats table said "No limit" for a field that has one.
    const map = { ...airQualityLimits() }
    ;(data?.exceedances || []).forEach((e) => { map[e.field] = e.limit })
    return map
  }, [data])

  // The single worst interval, for the caption under the trend chart.
  const worstBucket = useMemo(() => {
    if (!data?.buckets?.length) return null
    return data.buckets.reduce((a, b) => (b.aqi > a.aqi ? b : a))
  }, [data])

  const aqiExceedance = useMemo(
    () => (data?.exceedances || []).find((e) => e.field === 'Aqi'),
    [data]
  )

  const deviceLabel = deviceId === 'all'
    ? 'all rooms'
    : (devices.find((d) => d.deviceId === deviceId)?.room
      || devices.find((d) => d.deviceId === deviceId)?.name
      || deviceId)

  // ---- data ----------------------------------------------------------------

  useEffect(() => {
    if (!isAdmin) return
    const fetchDevices = async () => {
      const res = await fetch('/api/device', { headers: { Authorization: `Bearer ${user.token}` } })
      if (res.ok) setDevices(await res.json())
    }
    fetchDevices()
  }, [user, isAdmin])

  useEffect(() => {
    if (!isAdmin) return

    const fetchAnalytics = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      setError('')
      const effectiveTo = liveMode ? dayjs() : to

      const params = new URLSearchParams({
        from: from.toISOString(),
        to: effectiveTo.toISOString(),
        schoolHours: String(schoolHours),
      })
      if (deviceId !== 'all') params.append('deviceId', deviceId)
      if (granularity !== 'auto') params.append('granularity', granularity)

      try {
        const res = await fetch(`/api/aqi/analytics?${params}`, {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load analytics')
        setData(json)
        setLastUpdated(new Date())
      } catch (err) {
        setError(err.message)
      } finally {
        if (isInitial) setLoading(false)
      }
    }

    fetchAnalytics(true)
    if (!liveMode || !liveAllowed) return
    // Interval grows with the range so a wide window is not re-aggregated
    // every thirty seconds.
    const intervalMs = rangeHours <= 6 ? 30000 : 60000
    const id = setInterval(() => fetchAnalytics(false), intervalMs)
    return () => clearInterval(id)
  }, [user, isAdmin, from, to, deviceId, granularity, schoolHours, liveMode, liveAllowed, rangeHours])

  // ---- charts --------------------------------------------------------------

  // ---- Reconstruct every expected time slot, so a real gap (or a stretch
  // excluded by the school-hours filter) can be told apart from a reading,
  // instead of the line drawing straight through either. A slot with no
  // matching bucket is simply absent from data.buckets today (see
  // aqiController.js), never emitted with aqi:null — so "missing" has to be
  // detected by comparing consecutive timestamps against the expected grid.
  // Shared by the chart and its table-view twin, so the two never disagree.
  const trendSlots = useMemo(() => {
    if (!data) return null
    const isAqi = metric === 'aqi'
    const byTime = new Map(data.buckets.map((b) => [new Date(b.time).getTime(), b]))
    const fromMs = new Date(data.meta.from).getTime()
    const toMs = new Date(data.meta.to).getTime()
    const bucketMs = data.meta.bucketMs
    // Sub-day buckets sit on a fixed epoch-modulo grid (matches
    // aqiController.js's own bucketId formula exactly). Day/week/month are
    // real calendar boundaries, stepped with dayjs — approximate if the
    // browser's local zone differs from the app's, which is acceptable since
    // this tier only gets the coarse "gap" treatment below, not the fine
    // excluded-vs-missing one.
    const calendarUnit = { day: 'day', week: 'week', month: 'month' }[granularity]
    const slotTimes = []
    if (calendarUnit) {
      let t = dayjs(fromMs).startOf(calendarUnit)
      const end = dayjs(toMs)
      while (t.isBefore(end)) {
        slotTimes.push(t.valueOf())
        t = t.add(1, calendarUnit)
      }
    } else {
      let t = Math.floor(fromMs / bucketMs) * bucketMs
      while (t < toMs) {
        slotTimes.push(t)
        t += bucketMs
      }
    }

    // The excluded-vs-missing distinction only makes sense when one slot
    // falls entirely inside or outside school hours — true of the 5/15/60
    // minute buckets 'auto'/'hour' can produce (all divide an hour evenly),
    // not of 'auto's own 6-hour buckets or explicit day/week/month, where a
    // slot routinely straddles the boundary.
    const canClassifyExcluded = !calendarUnit && bucketMs <= 3600 * 1000
    const sh = data.meta?.schoolHours
    const isExcludedSlot = (ms) => {
      if (!canClassifyExcluded || !sh?.active) return false
      const { hour, dow } = tzHourAndDow(new Date(ms), data.meta.timezone)
      return !(sh.days.includes(dow) && hour >= sh.startHour && hour < sh.endHour)
    }

    const slots = slotTimes.map((t) => {
      const b = byTime.get(t)
      if (b) {
        const val = isAqi ? b.aqi : b[metric]
        const instant = b.count > 0 && (b.instantCount || 0) > b.count / 2
        return { time: t, value: val, state: 'data', instant, bucket: b }
      }
      return { time: t, value: null, state: isExcludedSlot(t) ? 'excluded' : 'missing', instant: false, bucket: null }
    })

    return { slots, fromMs, toMs, canClassifyExcluded, schoolHoursActive: !!sh?.active }
  }, [data, metric, granularity])

  const trendOption = useMemo(() => {
    if (!data || !trendSlots) return null
    const m = METRIC_OPTIONS.find((o) => o.value === metric) || METRIC_OPTIONS[0]
    const isAqi = metric === 'aqi'
    const limitField = METRIC_TO_FIELD[metric]
    const limitVal = limitField ? limits[limitField] : null
    const { slots, fromMs, toMs, canClassifyExcluded, schoolHoursActive } = trendSlots

    const points = slots.map((s) => [s.time, s.value, s.instant ? 1 : 0])
    const vals = slots.map((s) => s.value).filter((v) => v != null)
    const maxVal = vals.length ? Math.max(...vals) : 0

    // Day dividers across excluded stretches, so a long excluded run reads as
    // "a new day starts here" rather than a sensor fault.
    const markLineData = []
    if (canClassifyExcluded && schoolHoursActive) {
      let lastDay = null
      for (const s of slots) {
        if (s.state !== 'excluded') { lastDay = null; continue }
        const day = dayjs(s.time).format('YYYY-MM-DD')
        if (day !== lastDay) {
          markLineData.push({ xAxis: s.time, label: { show: false }, lineStyle: { color: ec.split, type: 'solid', width: 1 } })
          lastDay = day
        }
      }
    }
    if (limitVal) {
      // Muted neutral, not red — red is a category color in this scale now
      // and must not also mean "this is a threshold".
      markLineData.push({
        yAxis: limitVal,
        lineStyle: { type: 'dashed', color: ec.label, width: 1.5 },
        label: { formatter: `Limit ${limitVal}`, color: ec.label, position: 'insideEndTop', fontSize: 11, fontWeight: 600 },
      })
    }

    // Endpoint marker: the last real reading, colored by its own DENR
    // category. The only direct label on the chart — the axis and tooltip
    // carry everything else.
    const lastReal = [...slots].reverse().find((s) => s.value != null)
    const lastCategory = lastReal && isAqi ? categories.find((c) => lastReal.value >= c.min && lastReal.value <= c.max) : null
    const endpointColor = lastCategory ? CATEGORY_COLORS[lastCategory.name] : ec.line

    // Coverage rail: one bar per slot below the plot area, sharing its time
    // axis — filled where a reading exists (dimmer if instant-basis, i.e.
    // NowCast wasn't available yet), a flat neutral where the slot is
    // excluded by design, hatched where a reading is genuinely missing.
    const railData = slots.map((s) => {
      if (s.state === 'data') {
        return { value: [s.time, 1], itemStyle: { color: s.instant ? hexToRgba(ec.line, 0.35) : ec.line } }
      }
      if (s.state === 'excluded') {
        return { value: [s.time, 1], itemStyle: { color: ec.split } }
      }
      return {
        value: [s.time, 1],
        itemStyle: {
          color: 'transparent',
          borderColor: ec.axis,
          borderWidth: 1,
          decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: ec.axis },
        },
      }
    })

    return {
      grid: [
        { left: 48, right: 24, top: 24, bottom: 92 },
        { left: 48, right: 24, bottom: 56, height: 10 },
      ],
      visualMap: isAqi ? [
        {
          show: false, type: 'piecewise', dimension: 1, seriesIndex: 0,
          pieces: categories.map((c) => ({ min: c.min, max: c.max, color: CATEGORY_COLORS[c.name] })),
        },
        {
          show: false, type: 'piecewise', dimension: 2, seriesIndex: 0,
          pieces: [{ min: 0, max: 0, opacity: 1 }, { min: 1, max: 1, opacity: 0.45 }],
        },
      ] : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: ec.tooltipBg,
        borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
        axisPointer: { type: 'line', label: { formatter: (p) => dayjs(p.value).format('MMM D, h:mm A') } },
        formatter: (params) => {
          const p = params.find((x) => x.seriesIndex === 0) || params[0]
          const slot = slots[p.dataIndex]
          const t = dayjs(p.value[0]).format('MMM D, h:mm A')
          const val = p.value[1]
          if (val == null) {
            const reason = slot?.state === 'excluded' ? 'outside school hours' : 'no reading'
            return `${t}<br/><span style="opacity:.7">${reason}</span>`
          }
          const unit = m.unit ? ` ${m.unit}` : ''
          const cat = isAqi ? categories.find((c) => val >= c.min && val <= c.max) : null
          const catLine = cat ? `<br/><span style="color:${CATEGORY_COLORS[cat.name]};font-weight:600">${cat.name}</span>` : ''
          const instantLine = slot?.instant ? '<br/><span style="opacity:.7">instant reading — NowCast unavailable yet</span>' : ''
          return `${t}<br/><b>${val}</b>${unit}${catLine}${instantLine}`
        },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', height: 18, bottom: 18, xAxisIndex: [0, 1] }],
      xAxis: [
        {
          type: 'time', gridIndex: 0, min: fromMs, max: toMs,
          axisLine: { lineStyle: { color: ec.axis } },
          axisLabel: { color: ec.label, hideOverlap: true },
        },
        {
          type: 'time', gridIndex: 1, min: fromMs, max: toMs,
          axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
          axisPointer: { show: false },
        },
      ],
      yAxis: [
        {
          type: 'value', gridIndex: 0,
          min: 0,
          max: isAqi ? Math.max(150, Math.ceil((maxVal + 20) / 50) * 50) : undefined,
          name: m.unit || (isAqi ? 'AQI' : ''),
          nameTextStyle: { color: ec.label, align: 'left' },
          nameGap: 12,
          axisLabel: { color: ec.label },
          splitLine: { lineStyle: { color: ec.split } },
        },
        {
          type: 'value', gridIndex: 1, min: 0, max: 1,
          axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
        },
      ],
      series: [
        {
          name: m.label,
          type: 'line',
          showSymbol: false,
          connectNulls: false,
          data: points,
          lineStyle: { width: 2.5, cap: 'round', join: 'round', color: isAqi ? undefined : ec.line },
          itemStyle: { color: isAqi ? undefined : ec.line },
          markLine: markLineData.length ? { silent: true, symbol: 'none', data: markLineData } : undefined,
          markPoint: lastReal ? {
            symbolSize: 10,
            data: [{
              coord: [lastReal.time, lastReal.value],
              itemStyle: { color: endpointColor, borderColor: ec.tooltipBg, borderWidth: 2 },
              label: { formatter: `latest ${lastReal.value}`, color: ec.text, fontSize: 11, fontWeight: 700, position: 'top' },
            }],
          } : undefined,
        },
        {
          type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
          barWidth: '100%', barGap: '-100%',
          data: railData,
          silent: true,
        },
      ],
    }
  }, [data, trendSlots, metric, ec, limits, categories])

  // Category mix per day. Replaces the donut, which with NowCast smoothing was a
  // large single-colour circle: a stacked bar shows the same mix changing over
  // time in the same space.
  const categoryStackOption = useMemo(() => {
    if (!data?.categoriesByDay?.length) return null
    const days = data.categoriesByDay
    return {
      grid: { left: 44, right: 16, top: 12, bottom: 48 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: ec.tooltipBg,
        borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
      },
      legend: { bottom: 0, left: 'center', textStyle: { color: ec.label }, itemWidth: 12, itemHeight: 12 },
      xAxis: {
        type: 'category',
        data: days.map((d) => dayjs(d.day).format('MMM D')),
        axisLabel: { color: ec.label },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: '% of readings',
        nameTextStyle: { color: ec.label, align: 'left' },
        axisLabel: { color: ec.label, formatter: '{value}%' },
        splitLine: { lineStyle: { color: ec.split } },
      },
      series: categories.map((c) => ({
        name: c.name,
        type: 'bar',
        stack: 'mix',
        barMaxWidth: 44,
        itemStyle: { color: CATEGORY_COLORS[c.name] },
        data: days.map((d) => (d.total ? Math.round(((d.counts[c.name] || 0) / d.total) * 100) : 0)),
      })),
    }
  }, [data, ec, categories])

  const heatmapOption = useMemo(() => {
    if (!data?.heatmap?.length) return null
    const maxAqi = Math.max(...data.heatmap.map((h) => h.avgAqi), 60)

    // A cell averaging four readings should not look as confident as one
    // averaging four hundred. Opacity carries the sample count, scaled against
    // the median rather than the maximum so one very busy cell does not wash
    // out every other one.
    const counts = data.heatmap.map((h) => h.count).sort((a, b) => a - b)
    const median = counts[Math.floor(counts.length / 2)] || 1
    const grid = data.heatmap.map((h) => ({
      value: [h.hour, h.dow - 1, h.avgAqi, h.count],
      itemStyle: { opacity: 0.35 + 0.65 * Math.min(1, h.count / median) },
    }))
    return {
      tooltip: {
        backgroundColor: ec.tooltipBg,
        borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
        formatter: (p) =>
          `${DOW_LABELS[p.value[1]]} ${hourLabel(p.value[0])}<br/>Average AQI <b>${p.value[2]}</b><br/>` +
          `<span style="opacity:.7">${p.value[3]} reading${p.value[3] === 1 ? '' : 's'}</span>`,
      },
      grid: { left: 50, right: 16, top: 10, bottom: 60 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        splitArea: { show: true },
        axisLabel: { color: ec.label, interval: 2, formatter: (h) => hourLabel(Number(h)) },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      yAxis: {
        type: 'category',
        data: DOW_LABELS,
        splitArea: { show: true },
        axisLabel: { color: ec.label },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      visualMap: {
        // Explicitly dimension 2 (avgAqi). The default is the last dimension,
        // which is the sample count, and would colour by the wrong thing.
        dimension: 2,
        min: 0, max: maxAqi, calculable: true,
        orient: 'horizontal', left: 'center', bottom: 6,
        textStyle: { color: ec.label },
        // The standard's own colours, in order, rather than an invented ramp.
        inRange: { color: categories.map((c) => CATEGORY_COLORS[c.name]) },
      },
      series: [{
        name: 'AQI',
        type: 'heatmap',
        data: grid,
        // A cell backed by four readings should not look as solid as one backed
        // by four hundred. Opacity carries the sample count.
        itemStyle: {
          borderRadius: 2,
          borderColor: ec.tooltipBg,
          borderWidth: 1,
          opacity: 1,
        },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } },
      }],
    }
  }, [data, ec, categories])

  // ---- compliance report ---------------------------------------------------

  const downloadReport = () => {
    if (!data) return
    setPdfLoading(true)
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const M = 14
      let y = M

      const effectiveTo = liveMode ? dayjs() : to
      const line = (text, { size = 10, style = 'normal', gap = 5, color = 40 } = {}) => {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.setFontSize(size)
        pdf.setFont('helvetica', style)
        pdf.setTextColor(color)
        pdf.text(String(text), M, y)
        y += gap
      }
      const rule = () => {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.setDrawColor(210); pdf.line(M, y, pageW - M, y); y += 5
      }
      const row = (cells, widths, { style = 'normal', color = 40 } = {}) => {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.setFontSize(9); pdf.setFont('helvetica', style); pdf.setTextColor(color)
        let x = M
        cells.forEach((c, i) => { pdf.text(String(c), x, y); x += widths[i] })
        y += 5
      }

      // --- header ---
      line('BewAir — Indoor air quality report', { size: 17, style: 'bold', gap: 7, color: 20 })
      line('Philippine DENR compliance summary', { size: 10, color: 110, gap: 7 })
      rule()

      // --- what this covers ---
      line('Reporting period', { size: 11, style: 'bold', gap: 6, color: 20 })
      line(`${from.format('D MMMM YYYY, h:mm A')} to ${effectiveTo.format('D MMMM YYYY, h:mm A')}`)
      line(`Rooms: ${deviceLabel}`)
      line(data.meta?.schoolHours?.active
        ? `Filtered to school hours only (${data.meta.schoolHours.label}, ${data.meta.timezone}).`
        : 'All hours included, including nights and weekends when rooms are empty.')
      line(`Data coverage: ${data.coverage.pct}% of the period was observed.`)
      if (data.coverage.low) {
        line('Coverage is below 70%. Figures may not represent the full period.', { color: 150 })
      }
      if (data.legacyPct > 0) {
        line(`${data.legacyPct}% of readings predate the DENR standard change and were computed on the previous scale.`, { color: 150 })
      }
      y += 3
      rule()

      // --- per room ---
      line('By room', { size: 11, style: 'bold', gap: 6, color: 20 })
      const w = [46, 22, 22, 26, 30]
      row(['Room', 'Coverage', 'Avg AQI', 'Hours over', 'Main issue'], w, { style: 'bold', color: 80 })
      for (const d of data.byDevice) {
        const totalOver = Object.values(d.hoursOver || {}).reduce((a, b) => a + b, 0)
        row([
          (d.room || d.name || d.deviceId).slice(0, 24),
          `${d.coverage}%`,
          d.avgAqi ?? '—',
          d.count === 0 ? '—' : fmtHours(totalOver),
          d.count === 0 ? 'no readings' : (d.worstField ? `${FIELD_LABELS[d.worstField] || d.worstField}${d.driver ? ` (${d.driver})` : ''}` : 'within limits'),
        ], w)
      }
      y += 3

      // --- category mix per room ---
      line('Time in each DENR category, by room', { size: 11, style: 'bold', gap: 6, color: 20 })
      const cw = [40, ...categories.map(() => 24)]
      row(['Room', ...categories.map((c) => c.name.split(' ')[0])], cw, { style: 'bold', color: 80 })
      for (const d of data.byDevice) {
        if (d.count === 0) continue
        row([
          (d.room || d.name || d.deviceId).slice(0, 20),
          ...categories.map((c) => `${d.categoryPct?.[c.name] ?? 0}%`),
        ], cw)
      }
      y += 3
      rule()

      // --- exceedances ---
      line('Hours over limit', { size: 11, style: 'bold', gap: 6, color: 20 })
      const ew = [40, 30, 34, 30]
      row(['Pollutant', 'Limit', 'Hours over', '% of period'], ew, { style: 'bold', color: 80 })
      for (const e of data.exceedances) {
        row([
          FIELD_LABELS[e.field] || e.field,
          `${e.limit}${FIELD_UNITS[e.field] ? ' ' + FIELD_UNITS[e.field] : ''}`,
          `${e.hours} of ${e.expectedHours}`,
          `${e.pctTime}%`,
        ], ew)
      }
      y += 3
      rule()

      // --- provenance ---
      line('Standards applied', { size: 11, style: 'bold', gap: 6, color: 20 })
      const src = airQualitySource()
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90)
      for (const l of pdf.splitTextToSize(src, pageW - M * 2)) {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.text(l, M, y); y += 4.5
      }
      y += 3
      for (const l of pdf.splitTextToSize(
        'CO2 and formaldehyde are simulated by the FS00905B sensor from its VOC element rather than measured directly. Treat them as trend indicators, not instrument readings.',
        pageW - M * 2
      )) {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.text(l, M, y); y += 4.5
      }
      y += 3
      for (const l of pdf.splitTextToSize(
        'AQI is NowCast-based (DENR AO 2020-14): a weighted average leaning on the most recent hours, not a flat mean over the period.',
        pageW - M * 2
      )) {
        if (y > pageH - M - 6) { pdf.addPage(); y = M }
        pdf.text(l, M, y); y += 4.5
      }

      // --- footers ---
      const pages = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150)
        pdf.text(`Generated ${dayjs().format('D MMM YYYY, h:mm A')}`, M, pageH - 8)
        pdf.text(`Page ${i} of ${pages}`, pageW - M, pageH - 8, { align: 'right' })
      }

      pdf.save(`bewair-air-quality-${from.format('YYYYMMDD')}-${effectiveTo.format('YYYYMMDD')}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  // ---- render --------------------------------------------------------------

  if (!isAdmin) {
    return <Alert severity="info">Analytics is available to administrator accounts.</Alert>
  }

  const hasData = data && data.kpis.count > 0
  const noDataBecauseFilter = data && data.kpis.count === 0 && schoolHours

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Analytics</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download size={16} />}
              onClick={downloadReport}
              disabled={!hasData || pdfLoading}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
            >
              {pdfLoading ? 'Preparing report…' : 'Download report'}
            </Button>
          </Box>

          {/* One card carries the period, the filters, the headline figures and
              the provenance. The reader has to know what they are looking at and
              how much of it is real before any number means anything. */}
          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {from.format('D MMM')} – {(liveMode ? dayjs() : to).format('D MMM YYYY')}
                {' · '}{schoolHours ? (data?.meta?.schoolHours?.label || 'school hours') : 'all hours'}
                {' · '}{deviceLabel}
              </Typography>

              <Grid container spacing={1.5} alignItems="center" sx={{ mt: 0.5, mb: hasData ? 2 : 0 }}>
                <Grid item xs={12} md={2.2}>
                  <DateTimePicker label="From" value={from} onChange={(v) => { setFrom(v); setLiveMode(false) }} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
                </Grid>
                <Grid item xs={12} md={2.2}>
                  <DateTimePicker label="To" value={to} onChange={(v) => { setTo(v); setLiveMode(false) }} disabled={liveMode} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
                </Grid>
                <Grid item xs={6} md={1.7}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Room</InputLabel>
                    <Select label="Room" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                      <MenuItem value="all">All rooms</MenuItem>
                      {devices.map((d) => <MenuItem key={d.deviceId} value={d.deviceId}>{d.room || d.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={1.7}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Detail</InputLabel>
                    <Select label="Detail" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                      <MenuItem value="auto">Auto</MenuItem>
                      <MenuItem value="hour">Hourly</MenuItem>
                      <MenuItem value="day">Daily</MenuItem>
                      <MenuItem value="week">Weekly</MenuItem>
                      <MenuItem value="month">Monthly</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={1.7}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Metric</InputLabel>
                    <Select label="Metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
                      {METRIC_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2.5} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Switch size="small" checked={schoolHours} onChange={(e) => setSchoolHours(e.target.checked)} />}
                    label={<Typography variant="caption">School hours only</Typography>}
                  />
                  <Tooltip title={liveAllowed ? '' : 'Live refresh is available on ranges of 24 hours or less'}>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch size="small" checked={liveMode} disabled={!liveAllowed} onChange={(e) => { setLiveMode(e.target.checked); if (e.target.checked) setTo(dayjs()) }} />}
                      label={<Typography variant="caption" color="text.secondary">
                        {liveMode ? `Live · ${lastUpdated ? dayjs(lastUpdated).format('HH:mm:ss') : ''}` : 'Live off'}
                      </Typography>}
                    />
                  </Tooltip>
                </Grid>
              </Grid>

              {hasData && (
                <>
                  <Box sx={{ pt: 2, mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <div className="dash-kpis analytics-kpis">
                      <AnalyticsKpiTile
                        icon={<Activity size={20} />}
                        label="Average AQI"
                        value={data.kpis.avg}
                        accent={CATEGORY_COLORS[data.kpis.avgCategory]}
                        hint={data.kpis.avgCategory}
                        sub={categoryNote(data.kpis.avgCategory)}
                        fraction={aqiScaleMax ? Math.min(1, (data.kpis.avg ?? 0) / aqiScaleMax) : null}
                      />
                      <AnalyticsKpiTile
                        icon={<Radio size={20} />}
                        label="Data coverage"
                        value={`${data.coverage.pct}%`}
                        accent={data.coverage.low ? CATEGORY_COLORS['Very Unhealthy'] : undefined}
                        hint={`${fmtHours(data.coverage.observedMinutes / 60)} of ${fmtHours(data.coverage.expectedMinutes / 60)} hrs observed`}
                        sub={data.coverage.low ? 'Some readings missing — results may not represent the full period.' : 'Readings cover the period.'}
                        fraction={(data.coverage.pct ?? 0) / 100}
                      />
                      <AnalyticsKpiTile
                        icon={<AlertTriangle size={20} />}
                        label="Hours over AQI limit"
                        value={aqiExceedance ? aqiExceedance.hours : 0}
                        accent={(aqiExceedance?.hours ?? 0) > 0 ? CATEGORY_COLORS['Very Unhealthy'] : CATEGORY_COLORS['Good']}
                        hint={`of ${aqiExceedance?.expectedHours ?? 0} hrs in period`}
                        sub={`Limit ${limits.Aqi ?? 100} AQI`}
                        fraction={aqiExceedance?.expectedHours ? Math.min(1, aqiExceedance.hours / aqiExceedance.expectedHours) : 0}
                      />
                    </div>
                  </Box>

                  {data.legacyPct > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                      {data.legacyPct === 100
                        ? 'All readings in this range predate the DENR standard change and were computed on the previous scale.'
                        : `${data.legacyPct}% of readings predate the DENR standard change; the range mixes two scales.`}
                    </Typography>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!loading && !error && data && !hasData && (
            <Card><CardContent sx={{ py: 5, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No readings in this range</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {noDataBecauseFilter
                  ? `Nothing was recorded during ${data.meta?.schoolHours?.label || 'school hours'} between these dates.`
                  : 'No device reported between these dates.'}
              </Typography>
              {noDataBecauseFilter && (
                <Button variant="outlined" size="small" sx={{ textTransform: 'none' }} onClick={() => setSchoolHours(false)}>
                  Show all hours
                </Button>
              )}
            </CardContent></Card>
          )}

          {hasData && !loading && (
            <>
              {/* Rooms first: the page exists to answer which room needs doing something about. */}
              <Card sx={{ mb: 2.5 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Rooms needing attention</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Ranked by hours spent over a limit, using the same rule as live alerts.
                  </Typography>

                  {data.rooms.needsAttention.length === 0 ? (
                    <div className="dash-empty dash-empty-ok">
                      <span className="dash-ok-icon">✓</span>
                      Every reporting room stayed within its limits for the whole period.
                    </div>
                  ) : (
                    <div className="room-attn-list">
                      {data.rooms.needsAttention.map((r, i) => (
                        <RoomRow key={r.deviceId} room={r} rank={i + 1} periodHours={aqiExceedance?.expectedHours} />
                      ))}
                    </div>
                  )}

                  {(data.rooms.okCount > 0 || data.rooms.noDataCount > 0) && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {data.rooms.okCount > 0 && `${data.rooms.okRooms.join(', ')} stayed within every limit.`}
                      {data.rooms.noDataCount > 0 && ` ${data.rooms.noDataRooms.join(', ')} reported nothing at all in this range.`}
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Card sx={{ mb: 2.5 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {(METRIC_OPTIONS.find((o) => o.value === metric) || METRIC_OPTIONS[0]).label} over time
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Interval averages{schoolHours ? ', school hours only' : ''}.
                        {metric === 'aqi' ? ' The line is coloured by DENR category; the dashed line is the alert limit.' : ' The dashed line is the alert limit.'}
                        {metric === 'aqi' ? ' AQI is NowCast-based (DENR AO 2020-14) — a weighted average leaning on the most recent hours, not a flat mean.' : ''}
                      </Typography>
                      {worstBucket && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Worst interval: {dayjs(worstBucket.time).format('ddd D MMM, h A')} — average AQI {worstBucket.aqi}, peak {worstBucket.aqiMax}.
                        </Typography>
                      )}
                    </Box>
                    <ToggleButtonGroup size="small" exclusive value={trendView} onChange={(e, v) => { if (v) setTrendView(v) }}>
                      <ToggleButton value="chart" sx={{ textTransform: 'none', px: 1.5 }}>Chart</ToggleButton>
                      <ToggleButton value="table" sx={{ textTransform: 'none', px: 1.5 }}>Table</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  {trendView === 'chart' ? (
                    <>
                      {trendOption && <ReactECharts option={trendOption} style={{ height: 380, marginTop: 8 }} notMerge />}
                      {metric === 'aqi' && <CategoryLegend categories={categories} />}
                    </>
                  ) : trendSlots && (
                    <TrendTable
                      slots={trendSlots.slots}
                      categories={categories}
                      limits={limits}
                      isAqi={metric === 'aqi'}
                      unit={(METRIC_OPTIONS.find((o) => o.value === metric) || METRIC_OPTIONS[0]).unit}
                    />
                  )}
                </CardContent>
              </Card>

              <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid item xs={12} md={6}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Hours over limit</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Counted against the {data.exceedances[0]?.expectedHours ?? 0} hours in the period, not only the hours with data.
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {data.exceedances.map((e) => <ExceedanceRow key={e.field} item={e} />)}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Comparisons</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Average AQI against other periods.</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <CompareBlock
                          title="This period vs previous"
                          current={data.comparison.current.avgAqi}
                          previous={data.comparison.previous.avgAqi}
                          currentLabel="Current" previousLabel="Previous"
                        />
                        {data.comparison.weekendExcluded ? (
                          <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Weekday vs weekend</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Weekends fall outside school hours, so there is nothing to compare.{' '}
                              <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setSchoolHours(false)}>
                                Compare all hours
                              </Box>
                            </Typography>
                          </Box>
                        ) : (
                          <CompareBlock
                            title="Weekday vs weekend"
                            current={data.comparison.weekday.avgAqi}
                            previous={data.comparison.weekend.avgAqi}
                            currentLabel="Weekday" previousLabel="Weekend"
                          />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {categoryStackOption && (
                <Card sx={{ mb: 2.5 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Category mix by day</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Share of readings in each DENR category, per day.
                    </Typography>
                    <ReactECharts option={categoryStackOption} style={{ height: 260 }} notMerge />
                  </CardContent>
                </Card>
              )}

              <Card sx={{ mb: 2.5 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Hour and weekday pattern</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Average AQI by local hour ({data.meta?.timezone}) across the selected range.
                  </Typography>
                  {data.heatmapDays < 3 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                      A recurring pattern needs at least three days. This range covers {data.heatmapDays === 1 ? 'one day' : `${data.heatmapDays} days`}.
                    </Typography>
                  ) : heatmapOption ? (
                    <ReactECharts option={heatmapOption} style={{ height: 300 }} notMerge />
                  ) : null}
                </CardContent>
              </Card>

              <Card sx={{ mb: 2.5 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Pollutant detail</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Typical range is the 5th to 95th percentile — the extremes are single samples and often sensor glitches.
                  </Typography>
                  <PollutantStatsTable stats={data.pollutantStats} limits={limits} />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Recent readings</Typography>
                  <div style={{ width: '100%' }}>
                    <DataGrid
                      autoHeight
                      density="compact"
                      rows={data.recent.map((r, i) => ({ id: i, ...r }))}
                      columns={[
                        { field: 'createdAt', headerName: 'Time', width: 170, valueFormatter: (v) => dayjs(v).format('MMM D, h:mm:ss A') },
                        { field: 'room', headerName: 'Room', width: 130, valueGetter: (v, row) => devices.find((d) => d.deviceId === row.deviceId)?.room || row.deviceId },
                        { field: 'Aqi', headerName: 'AQI', width: 80 },
                        {
                          field: 'category', headerName: 'Category', width: 190,
                          renderCell: (p) => (
                            <Chip size="small" label={p.value}
                              sx={{ bgcolor: CATEGORY_COLORS[p.value], color: '#fff', fontWeight: 600 }} />
                          ),
                        },
                        { field: 'PM25', headerName: 'PM2.5', width: 90 },
                        { field: 'PM10', headerName: 'PM10', width: 90 },
                        { field: 'CO2', headerName: 'CO₂', width: 90 },
                        { field: 'Temperature', headerName: 'Temp', width: 90 },
                        { field: 'Humidity', headerName: 'Humidity', width: 100 },
                      ]}
                      initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                      pageSizeOptions={[10, 25, 50]}
                      disableRowSelectionOnClick
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

// ---------------------------------------------------------------------------

// A KPI tile matching the Dashboard page's .dash-kpi tiles (same classes,
// same accent-top-border pattern), via the .analytics-kpi variant that only
// bumps the type scale up slightly for this page's larger figures. The fill
// bar is not decoration: its width is the same number the tile reports, so
// "how full is the bar" and "how good is this figure" are the same question.
// `fraction` is 0–1, or omitted for figures with no natural scale to show
// one against.
const AnalyticsKpiTile = ({ icon, label, value, hint, sub, accent, fraction }) => (
  <div className="dash-kpi analytics-kpi" style={{ borderTopColor: accent }}>
    <div className="dash-kpi-icon" style={{ color: accent }}>{icon}</div>
    <div className="dash-kpi-label">{label}</div>
    <div className="dash-kpi-value" style={{ color: accent }}>{value}</div>
    {typeof fraction === 'number' && (
      <div style={{ height: 5, borderRadius: 999, background: 'var(--color-border-subtle, #eef2f6)', overflow: 'hidden', margin: '6px 0' }}>
        <div style={{
          height: '100%',
          width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`,
          background: accent || 'var(--color-text-tertiary, #94a3b8)',
          borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
      </div>
    )}
    {hint && <div className="analytics-kpi-hint" style={{ color: accent }}>{hint}</div>}
    {sub && <div className="dash-kpi-sub">{sub}</div>}
  </div>
)

// The list is already ranked by hours over limit (the caption above it says
// so), so the rank number is real information, not decoration. The fill bar
// is the same device used on the KPI tiles above: its width is worstHours as
// a share of the period, so a glance at the bar tells you the severity
// before reading a single word.
const RoomRow = ({ room, rank, periodHours }) => {
  const accent = CATEGORY_COLORS['Very Unhealthy']
  const others = Object.entries(room.hoursOver || {}).filter(([f]) => f !== room.worstField)
  const fraction = periodHours ? Math.max(0, Math.min(1, room.worstHours / periodHours)) : 0
  return (
    <div className="room-attn-row">
      <div className="room-attn-rank" style={{ background: `${accent}20`, color: accent }}>{rank}</div>
      <div className="room-attn-body">
        <div className="room-attn-top">
          <span className="room-attn-name">{room.room || room.name}</span>
          <span className="room-attn-stats">average AQI {room.avgAqi ?? '—'} · {room.coverage}% coverage</span>
        </div>
        <div className="room-attn-reason" style={{ color: accent }}>
          {FIELD_LABELS[room.worstField] || room.worstField}
          {room.driver ? ` (${FIELD_LABELS[room.driver] || room.driver})` : ''}
          {' · '}{fmtHours(room.worstHours)} hr{room.worstHours === 1 ? '' : 's'} over limit
        </div>
        <div className="room-attn-bar-track">
          <div className="room-attn-bar-fill" style={{ width: `${Math.round(fraction * 100)}%`, background: accent }} />
        </div>
        {others.length > 0 && (
          <div className="room-attn-chips">
            {others.map(([f, h]) => (
              <span key={f} className="room-attn-chip">{FIELD_LABELS[f] || f} {fmtHours(h)}h</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Colour is the only category cue on the trend line now, so it can't be the
// only way to read one — a horizontal scale legend, generated from the same
// served categories the visualMap pieces come from.
const CategoryLegend = ({ categories }) => (
  <div className="aqi-legend">
    {categories.map((c) => (
      <div key={c.name} className="aqi-legend-item">
        <span className="aqi-legend-swatch" style={{ background: CATEGORY_COLORS[c.name] }} />
        <span className="aqi-legend-name">{c.name}</span>
        <span className="aqi-legend-range">{c.min}–{c.max}</span>
      </div>
    ))}
  </div>
)

// Table-view twin for the trend chart, so no value is colour-only. Same
// conventions as PollutantStatsTable below: plain MUI Table, bold headers,
// right-aligned tabular-nums numbers, em dash for nulls.
const TrendTable = ({ slots, categories, limits, isAqi, unit }) => (
  <Box sx={{ maxHeight: 420, overflow: 'auto', mt: 1 }}>
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
          <TableCell align="right" sx={{ fontWeight: 700 }}>Value</TableCell>
          {isAqi && <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>}
          {isAqi && <TableCell sx={{ fontWeight: 700 }}>Driver</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {slots.map((s) => {
          const cat = isAqi && s.value != null ? categories.find((c) => s.value >= c.min && s.value <= c.max) : null
          return (
            <TableRow key={s.time} hover>
              <TableCell>{dayjs(s.time).format('MMM D, h:mm A')}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.value == null ? '—' : `${s.value}${unit ? ` ${unit}` : ''}`}
              </TableCell>
              {isAqi && (
                <TableCell>
                  {s.value == null ? (
                    <Chip size="small" variant="outlined" label={s.state === 'excluded' ? 'Excluded' : 'No reading'} />
                  ) : cat ? (
                    <Chip size="small" label={cat.name} sx={{ bgcolor: CATEGORY_COLORS[cat.name], color: '#fff', fontWeight: 600 }} />
                  ) : '—'}
                </TableCell>
              )}
              {isAqi && <TableCell>{s.bucket ? bucketDriver(s.bucket, limits) : '—'}</TableCell>}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  </Box>
)

const PollutantStatsTable = ({ stats, limits }) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        <TableCell sx={{ fontWeight: 700 }}>Pollutant</TableCell>
        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>Average</TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>Typical range (p5–p95)</TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>Hours over limit</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {POLLUTANTS.map((p) => {
        const s = stats?.[p.key]
        if (!s) return null
        // Temperature and Humidity are two-sided, so their limits live under
        // <Field>Min/<Field>Max. Looking up limits['Temperature'] is why these
        // rows used to read "No limit".
        const twoSided = p.key === 'Temperature' || p.key === 'Humidity'
        const lo = twoSided ? limits[`${p.key}Min`] : null
        const hi = twoSided ? limits[`${p.key}Max`] : limits[p.key]
        const within = s.avg == null ? null
          : twoSided ? (lo == null || s.avg >= lo) && (hi == null || s.avg <= hi)
            : hi == null ? null : s.avg <= hi
        const u = p.unit ? ` ${p.unit}` : ''
        return (
          <TableRow key={p.key} hover>
            <TableCell sx={{ fontWeight: 700 }}>{p.label}</TableCell>
            <TableCell>
              {within == null ? (
                <Chip size="small" label="No limit" variant="outlined" />
              ) : (
                <Chip size="small" label={within ? 'Within limit' : 'Over limit'}
                  sx={{ bgcolor: within ? CATEGORY_COLORS['Good'] : CATEGORY_COLORS['Very Unhealthy'], color: '#fff', fontWeight: 600 }} />
              )}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.avg ?? '—'}{u}</TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {s.p05 == null || s.p95 == null ? '—' : `${s.p05} – ${s.p95}${u}`}
            </TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {s.hoursOver == null ? '—' : s.hoursOver}
            </TableCell>
          </TableRow>
        )
      })}
    </TableBody>
  </Table>
)

const CompareBlock = ({ title, current, previous, currentLabel, previousLabel }) => {
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{title}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
        <Typography sx={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{current ?? '—'}</Typography>
        <Typography variant="body2" color="text.secondary">{currentLabel}</Typography>
        <Typography variant="body2" color="text.secondary">vs</Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{previous ?? '—'}</Typography>
        <Typography variant="body2" color="text.secondary">{previousLabel}</Typography>
      </Box>
      {delta != null && delta !== 0 && (
        <Typography variant="caption" sx={{ fontWeight: 700, color: delta < 0 ? CATEGORY_COLORS['Good'] : CATEGORY_COLORS['Fair'] }}>
          {delta < 0 ? 'lower' : 'higher'} by {Math.abs(delta)}%
        </Typography>
      )}
    </Box>
  )
}

const ExceedanceRow = ({ item }) => {
  const over = item.hours > 0
  return (
    <Box sx={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
      '&:last-of-type': { borderBottom: 0 },
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{FIELD_LABELS[item.field] || item.field}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          limit {item.limit}{FIELD_UNITS[item.field] ? ` ${FIELD_UNITS[item.field]}` : ''}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: over ? CATEGORY_COLORS['Very Unhealthy'] : CATEGORY_COLORS['Good'] }}>
          {item.hours} of {item.expectedHours} hrs
        </Typography>
        <Typography variant="caption" color="text.secondary">{item.pctTime}% of the period</Typography>
      </Box>
    </Box>
  )
}

export default Analytics
