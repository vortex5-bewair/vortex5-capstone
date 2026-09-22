// Facts shown in the landing page's "Partner school" block, and the public
// site address the QR code (src/assets/bewair-website-qr.svg) points at.
// Deliberately contains no room / student counts: those would be numbers the
// system does not own and could not keep correct.
export const PARTNER_SCHOOL = {
  name: 'St. Vincent School Manila',
  initials: 'SV',
  address: 'Arroceros St., Ermita, Manila',
  established: 1958,
  blurb:
    'St. Vincent School Manila is our founding partner — the school where BewAir sensors monitor classroom air quality.',
}

export const WEBSITE_URL = 'https://bewair.onrender.com'
export const WEBSITE_LABEL = 'bewair.onrender.com'

// The mobile app isn't on an app store yet — it's distributed as a direct
// APK download from Google Drive. Opens in a new tab (external host, and a
// "view" link like this triggers Drive's own download flow).
export const MOBILE_APP_URL = 'https://drive.google.com/file/d/1jQUfFUnc6V7cP1z0Yuh5-LTCEReqR45S/view'
