import { useState } from 'react'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

// Circular user avatar. Renders the profile picture when one is available and
// loads successfully, otherwise falls back to the user's initials (or a "?"
// glyph). Using a real <img> with an onError handler — instead of a CSS
// background-image — is what makes the fallback possible: a missing or broken
// picture URL (e.g. a stale pre-Cloudinary /uploads/ path whose file was wiped
// from Render's ephemeral disk) silently fails a background-image and leaves a
// blank circle, whereas onError lets us swap in the initials.
export default function Avatar({ src, name, email, size = 40, className = '' }) {
  // Track the specific src that failed rather than a boolean, so a new src
  // (e.g. right after uploading a new picture) automatically gets another try.
  const [failedSrc, setFailedSrc] = useState(null)

  const initials =
    ((name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('') ||
      (email || '?')[0] ||
      '?').toUpperCase()

  const showImg = Boolean(src) && failedSrc !== src

  return (
    <span
      className={`avatar ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {showImg ? (
        <img
          className="avatar-img"
          src={resolveMediaUrl(src)}
          alt=""
          width={size}
          height={size}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
