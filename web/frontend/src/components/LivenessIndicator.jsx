import { memo } from 'react'

// A small dot + age, driven by GET /api/aqi/live — never a moving figure.
// For scanning screens (AdminDashboard, StaffDeviceList) where a 30-second
// spike on one device isn't worth surfacing across a whole grid of tiles;
// this answers "is this device alive?" without putting a number where it
// doesn't help.
//
// Memoized so a render of the parent page that isn't driven by a liveness
// publish — a devices/readings poll on StaffDeviceList, the online-check
// clock tick — doesn't also re-render every badge in the grid: `live` is the
// same object reference in those renders, so the shallow prop comparison
// bails out.
const LivenessIndicator = memo(function LivenessIndicator({ live }) {
  if (!live?.available) {
    return <span className="dash-device-liveness dash-device-liveness-idle">Not reporting</span>
  }
  const ageS = Math.round((live.ageMs ?? 0) / 1000)
  return (
    <span className={`dash-device-liveness ${live.stale ? 'dash-device-liveness-idle' : 'dash-device-liveness-active'}`}>
      <span className="dash-device-liveness-dot" />
      {live.stale ? 'Not reporting' : `${ageS}s ago`}
    </span>
  )
})

export default LivenessIndicator
