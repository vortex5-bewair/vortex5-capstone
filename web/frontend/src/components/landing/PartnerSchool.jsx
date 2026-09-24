import { Smartphone } from 'lucide-react'
import { PARTNER_SCHOOL, WEBSITE_URL, WEBSITE_LABEL, MOBILE_APP_URL } from '../../utils/partnerSchool'
import qrCode from '../../assets/qr_landingPage.jpg'
import stVincentLogo from '../../assets/St_Vincent_logo.jpg'
import stVincentBanner from '../../assets/St_Vincent_Banner.jpg'

// Partner school + the QR code for the landing page, plus a separate link to
// the mobile app (Google Drive — no app-store listing yet). Both images are
// static assets, so they're same-origin as far as the CSP is concerned and
// need no runtime library; the Drive link is a plain external navigation,
// which the CSP's resource-loading rules don't govern.
const PartnerSchool = () => (
  <>
    <div
      className="landing-partner-banner"
      style={{ backgroundImage: `url(${stVincentBanner})` }}
      aria-hidden="true"
    />

    <div className="landing-partner">
      <div>
        <p className="landing-eyebrow-blue">Partner school</p>
        <div className="landing-partner-card">
          <div className="landing-partner-badge">
            <img src={stVincentLogo} alt={`${PARTNER_SCHOOL.name} logo`} width={44} height={44} />
          </div>
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
          <img src={qrCode} alt="QR code to download the BewAir mobile app" width={208} height={208} />
        </div>
        <div className="landing-qr-caption">Scan to download mobile app</div>
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
  </>
)

export default PartnerSchool
