import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Bell, Smartphone, Users, Megaphone,
  Wind, Droplets, Thermometer, Cpu, Cloud, MonitorSmartphone,
} from 'lucide-react'
import { PARTNER_SCHOOL } from '../utils/partnerSchool'
import { usePublicLanding } from '../hooks/usePublicLanding'
import LiveReadingsCard from '../components/landing/LiveReadingsCard'
import RoomsAtAGlance from '../components/landing/RoomsAtAGlance'
import VirtualBulletinBoard from '../components/landing/VirtualBulletinBoard'
import PartnerSchool from '../components/landing/PartnerSchool'
import AboutUs from '../components/landing/AboutUs'
import bewairLogoWhite from '../assets/bewair_logo_white.png'
import bewairLogoBlack from '../assets/bewair_logo_black.png'

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
  // One poll feeds the hero card and the rooms list, so they can never disagree.
  const { data, loaded, error } = usePublicLanding()
  const headline = data?.summary?.headline ?? null
  const isLive = !!headline?.live

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className={`landing-nav ${scrolled ? 'landing-nav-scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <a href="#top" className="landing-nav-brand" aria-label="BewAir home">
            <img src={bewairLogoBlack} alt="" width={28} height={28} />
            <span className="landing-wordmark"><b>BEW</b>AIR</span>
          </a>
          <div className="landing-nav-links">
            <a href="#about">About Us</a>
            <a href="#bulletin">Bulletin</a>
            <a href="#partner">Partner</a>
          </div>
          <div className="landing-nav-actions">
            <Link to="/login" className="landing-btn-ghost landing-btn-ghost-dark">Log In</Link>
            <Link to="/signup" className="landing-btn-solid">Sign Up</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="landing-hero" id="top">
        <div className="landing-hero-art" aria-hidden="true" />
        <div className="landing-hero-inner">
          <div className="landing-eyebrow-live">
            <span className={`landing-live-dot ${isLive ? 'is-live' : ''}`} aria-hidden="true" />
            <span>
              {isLive ? 'Live' : 'BewAir'} · {PARTNER_SCHOOL.name}
              {headline ? ` · ${headline.room}` : ''}
            </span>
          </div>

          <h1 className="landing-hero-title">
            Your classroom<br />
            air, <em>visible</em><br />
            <span className="landing-accent">at last.</span>
          </h1>

          <p className="landing-hero-subtitle">
            BewAir pairs sensor nodes in every classroom with live dashboards and instant
            alerts, so admins and staff always know when the air needs attention.
          </p>

          <div className="landing-hero-actions">
            <Link to="/signup" className="landing-btn-solid landing-btn-lg">Sign Up</Link>
            <Link to="/login" className="landing-btn-ghost landing-btn-ghost-dark landing-btn-lg">Log In</Link>
          </div>

          <LiveReadingsCard headline={headline} loaded={loaded} error={error} />
        </div>
      </header>

      {/* ── About us (team) ── */}
      <section id="about" className="landing-section landing-section-flush">
        <div className="landing-container">
          <AboutUs />
        </div>
      </section>

      {/* ── Rooms at a glance (live, registered devices) ── */}
      <section id="rooms" className="landing-section">
        <div className="landing-container">
          <RoomsAtAGlance data={data} loaded={loaded} error={error} />
        </div>
      </section>

      {/* ── The Problem ── */}
      <section className="landing-section">
        <div className="landing-container landing-narrow">
          <h2 className="landing-section-title">
            Classrooms rarely get <em>measured</em>
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
            <h2 className="landing-section-title">How BewAir <em>solves it</em></h2>
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
            <h2 className="landing-section-title">What it <em>measures</em></h2>
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
            <h2 className="landing-section-title">How it <em>works</em></h2>
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

      {/* ── Virtual bulletin board (real announcements, read-only) ── */}
      <section id="bulletin" className="landing-section">
        <div className="landing-container">
          <VirtualBulletinBoard data={data} loaded={loaded} error={error} />
        </div>
      </section>

      {/* ── Partner school + QR ── */}
      <section id="partner" className="landing-section landing-section-mist">
        <div className="landing-container">
          <PartnerSchool />
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
