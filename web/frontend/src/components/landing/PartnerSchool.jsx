import { PARTNER_SCHOOL, WEBSITE_URL, WEBSITE_LABEL } from '../../utils/partnerSchool'
import qrCode from '../../assets/bewair-website-qr.svg'

// Partner school + the QR code for the website. The QR is a static asset
// (decoded and checked to equal WEBSITE_URL when it was generated), so it is
// same-origin as far as the CSP is concerned and needs no runtime library.
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
    </div>
  </div>
)

export default PartnerSchool
