import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Bell, Smartphone, Users, Megaphone,
  Wind, Droplets, Thermometer, Cpu, Cloud, MonitorSmartphone,
} from 'lucide-react'
import { CATEGORY_COLORS } from '../utils/airQualityGuidance'
import bewairLogoWhite from '../assets/bewair_logo_white.png'
import bewairLogoBlack from '../assets/bewair_logo_black.png'

// The real AQI scale this system already uses, worst → best — the landing
// page's signature visual is this exact gradient, not an invented one.
// Derived from the canonical category order (Good first) rather than named
// literally, so a change to the DENR table cannot leave a hole in the gradient.
const AQI_SWEEP = Object.values(CATEGORY_COLORS).reverse()

const SAMPLE_READINGS = [
  { label: 'PM2.5', value: '12', unit: 'µg/m³' },
  { label: 'CO₂', value: '612', unit: 'ppm' },
  { label: 'TVOC', value: '180', unit: 'µg/m³' },
  { label: 'Temp', value: '24.6', unit: '°C' },
]

const SOLUTIONS = [
  { icon: Activity, title: 'Live AQI Dashboard', desc: 'Real-time PM2.5, CO₂, TVOC, and more, visualized per classroom the moment a reading comes in.' },
  { icon: Bell, title: 'Instant Alerts', desc: 'Configurable thresholds notify admins and staff the moment a classroom\'s air needs attention.' },
  { icon: Smartphone, title: 'Mobile + Web Access', desc: 'Check air quality from the staff room, the front office, or your phone between classes.' },
  { icon: Users, title: 'Role-Based Access', desc: 'Admins manage devices, thresholds, and accounts; staff see what matters for their own rooms.' },
  { icon: Megaphone, title: 'Bulletin Board', desc: 'Share announcements and health advisories school-wide, right alongside the air quality data.' },
]

const METRICS = [
  { icon: Wind, label: 'PM1', note: 'Ultra-fine particles' },
  { icon: Wind, label: 'PM2.5', note: 'Fine particles that reach deep into the lungs' },
  { icon: Wind, label: 'PM10', note: 'Coarser dust and particulate matter' },
  { icon: Cloud, label: 'TVOC', note: 'Volatile organic compounds from materials and cleaners' },
  { icon: Cloud, label: 'CO₂', note: 'A direct signal of how well a room is ventilated' },
  { icon: Cloud, label: 'Formaldehyde', note: 'A common indoor irritant from furnishings' },
  { icon: Thermometer, label: 'Temperature', note: 'Thermal comfort for learning' },
  { icon: Droplets, label: 'Humidity', note: 'Keeps mold and dust mites in check' },
]

const STEPS = [
  { icon: Cpu, title: 'Plug in a sensor node', desc: 'An ESP32-based BewAir sensor joins the classroom\'s Wi-Fi in minutes — no networking expertise needed.' },
  { icon: Cloud, title: 'Readings stream to the cloud', desc: 'The sensor reports air quality data securely to BewAir\'s backend as it happens.' },
  { icon: MonitorSmartphone, title: 'Staff see it and act', desc: 'Live readings, alerts, and history are available on the web dashboard and the mobile app.' },
]

const LandingPage = () => {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const sweepGradient = `linear-gradient(90deg, ${AQI_SWEEP.join(', ')})`

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className={`landing-nav ${scrolled ? 'landing-nav-scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <div className="landing-nav-brand">
            <img src={scrolled ? bewairLogoBlack : bewairLogoWhite} alt="BewAir" width={30} height={30} />
            <span className={scrolled ? 'landing-nav-title-dark' : 'landing-nav-title-light'}>BewAir</span>
          </div>
          <div className="landing-nav-actions">
            <Link to="/login" className={`landing-btn-ghost ${scrolled ? 'landing-btn-ghost-dark' : ''}`}>Log In</Link>
            <Link to="/signup" className="landing-btn-solid">Sign Up</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-eyebrow">
            IoT Air Quality Monitoring for Schools
          </div>

          <h1 className="landing-hero-title">
            Indoor air quality,<br />
            <span className="landing-accent">monitored</span> — not guessed.
          </h1>

          <p className="landing-hero-subtitle">
            BewAir pairs sensor nodes in every classroom with live dashboards and instant
            alerts, so admins and staff always know when the air needs attention.
          </p>

          <div className="landing-hero-actions">
            <Link to="/signup" className="landing-btn-solid landing-btn-lg">Sign Up</Link>
            <Link to="/login" className="landing-btn-ghost landing-btn-lg">Log In</Link>
          </div>

          {/* Signature element: the app's real AQI scale as a breath-line */}
          <div className="landing-sweep-wrap">
            <div className="landing-sweep" style={{ background: sweepGradient }} />
            <div className="landing-sweep-labels">
              <span>Hazardous</span>
              <span>Good</span>
            </div>
          </div>

          <div className="landing-readout">
            {SAMPLE_READINGS.map((r) => (
              <div key={r.label} className="landing-readout-chip">
                <span className="landing-readout-label">{r.label}</span>
                <span className="landing-readout-value">{r.value}<small>{r.unit}</small></span>
              </div>
            ))}
            <span className="landing-readout-caption">Sample reading from a connected classroom</span>
          </div>
        </div>
      </header>

      {/* ── The Problem ── */}
      <section className="landing-section landing-section-transition">
        <div className="landing-container landing-narrow">
          <h2 className="landing-section-title">
            Classrooms rarely get measured
          </h2>
          <p className="landing-body-text">
            Students spend most of the school day indoors, in rooms that are often
            under-ventilated and share air with dozens of others. Fine particulates,
            volatile compounds from furnishings and cleaning supplies, and CO₂ buildup
            from a full room can all affect focus and health — and none of it is visible
            without the right instruments. Most schools have no way to know any of this
            is happening until it's already a problem.
          </p>
        </div>
      </section>

      {/* ── Solution ── */}
      <section className="landing-section landing-section-mist">
        <div className="landing-container">
          <div className="landing-section-head">
            <h2 className="landing-section-title">How BewAir solves it</h2>
            <p className="landing-section-subtitle">
              A complete monitoring system, built for how schools actually run.
            </p>
          </div>

          <div className="landing-solution-grid">
            {SOLUTIONS.map((s) => (
              <div key={s.title} className="landing-solution-card">
                <div className="landing-solution-icon"><s.icon size={22} /></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What it measures ── */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section-head">
            <h2 className="landing-section-title">What it measures</h2>
            <p className="landing-section-subtitle">
              Eight readings per sensor, the same ones shown on every BewAir dashboard.
            </p>
          </div>

          <div className="landing-metrics-grid">
            {METRICS.map((m) => (
              <div key={m.label} className="landing-metric-card">
                <m.icon size={20} />
                <div>
                  <div className="landing-metric-label">{m.label}</div>
                  <div className="landing-metric-note">{m.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section landing-section-mist">
        <div className="landing-container landing-narrow">
          <div className="landing-section-head">
            <h2 className="landing-section-title">How it works</h2>
          </div>

          <div className="landing-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="landing-step">
                <div className="landing-step-number">{i + 1}</div>
                <div className="landing-step-icon"><s.icon size={20} /></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="landing-cta">
        <div className="landing-cta-inner">
          <h2>Ready to see what your classrooms are breathing?</h2>
          <div className="landing-hero-actions">
            <Link to="/signup" className="landing-btn-solid landing-btn-lg">Sign Up</Link>
            <Link to="/login" className="landing-btn-ghost landing-btn-lg">Log In</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <img src={bewairLogoWhite} alt="BewAir" width={24} height={24} />
            <span>BewAir</span>
          </div>
          <p>Indoor air quality monitoring for schools.</p>
          <p className="landing-footer-note">Contact your school administrator for access.</p>
          <p className="landing-footer-copyright">&copy; {new Date().getFullYear()} BewAir</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
