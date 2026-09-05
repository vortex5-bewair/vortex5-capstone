// A small dot + age, driven by GET /api/aqi/live — never a moving figure.
// For scanning screens (AdminDashboard, StaffDeviceList) where a 30-second
// spike on one device isn't worth surfacing across a whole grid of tiles;
// this answers "is this device alive?" without putting a number where it
// doesn't help.
const LivenessIndicator = ({ live }) => {
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
}

export default LivenessIndicator
