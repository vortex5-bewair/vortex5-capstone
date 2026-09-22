import { Smartphone } from 'lucide-react'
import { PARTNER_SCHOOL, WEBSITE_URL, WEBSITE_LABEL, MOBILE_APP_URL } from '../../utils/partnerSchool'
import qrCode from '../../assets/qr_landingPage.jpg'

// Partner school + the QR code for the landing page, plus a separate link to
// the mobile app (Google Drive — no app-store listing yet). The QR is a
// static asset, so it's same-origin as far as the CSP is concerned and needs
// no runtime library; the Drive link is a plain external navigation, which
// the CSP's resource-loading rules don't govern.
const PartnerSchool = () => (
  <div className="landing-partner">
    <div>
      <p className="landing-eyebrow-blue">Partner school</p>
      <div className="landing-partner-card">
        <div className="landing-partner-badge" aria-hidden="true">{PARTNER_SCHOOL.initials}</div>
        <div>
          <h3 className="landing-partner-name">{PARTNER_SCHOOL.name}</h3>
          <div className="landing-partner-meta">
            {PARTNER_SCHOOL.address} · Est. {PARTNER_SCHOOL.established}
          </div>
        </div>
      </div>
      <p className="landing-partner-blurb">{PARTNER_SCHOOL.blurb}</p>
    </div>

    <div className="landing-qr">
      <div className="landing-qr-card">
        <img src={qrCode} alt={`QR code that opens ${WEBSITE_LABEL}`} width={208} height={208} />
      </div>
      <div className="landing-qr-caption">Scan to open the website</div>
      <a className="landing-qr-url" href={WEBSITE_URL}>{WEBSITE_LABEL}</a>
      <a
        className="landing-qr-app"
        href={MOBILE_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Smartphone size={14} aria-hidden="true" /> Mobile app
      </a>
    </div>
  </div>
)

export default PartnerSchool
