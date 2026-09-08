import { lazy, Suspense } from 'react'
import {BrowserRouter, Routes, Route, Navigate, useLocation} from 'react-router-dom'
import { useAuthContext } from './hooks/useAuthContext';

// The app shell and the three entry points stay eager — they are the first
// paint for a logged-out visitor (LandingPage/Login) or a logged-in one (Home),
// so deferring them would only add a round trip before anything renders.
import Home from './pages/Home.jsx'
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/Login.jsx';
import Navbar from './components/Navbar.jsx'
import Header from './components/Header.jsx';

// Everything else is split out of the main bundle. Analytics matters most: it
// alone owns ECharts, the MUI DataGrid, the date pickers and jsPDF, none of
// which any other route touches — before this, every visitor to /login paid to
// download and parse all of it.
const Signup = lazy(() => import('./pages/Signup.jsx'));
const VerifySignup = lazy(() => import('./pages/VerifySignup.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Auditlog = lazy(() => import('./pages/Auditlog.jsx'));
const UserManagement = lazy(() => import('./pages/UserManagement.jsx'));
const DeviceManagement = lazy(() => import('./pages/DeviceManagement.jsx'));
const ClassroomRecords = lazy(() => import('./pages/ClassroomRecords.jsx'));
const AlertsAndNotifications = lazy(() => import('./pages/AlertsAndNotifications.jsx'));
const ConnectSensor = lazy(() => import('./pages/ConnectSensor.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const BulletinBoard = lazy(() => import('./pages/BulletinBoard.jsx'));
const AnimationViewer = lazy(() => import('./pages/AnimationViewer.jsx'));
const WebBulletinBoard = lazy(() => import('./pages/WebBulletinBoard.jsx'));
const Thresholds = lazy(() => import('./pages/Thresholds.jsx'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail.jsx'));

// Create a separate component for the routes (needs to be inside BrowserRouter)
function AppRoutes() {
  const { user, authReady } = useAuthContext()
  const location = useLocation()

  // Hold every routing decision until the stored session has been read.
  //
  // Without this, refreshing a deep page bounced to the dashboard: on the very
  // first render `user` is null because the effect that restores it has not run
  // yet, so a guarded route redirected to /login, and /login then redirected to
  // "/" the moment the session arrived. The destination was lost in between.
  //
  // Rendering nothing for that one frame is correct rather than merely quiet:
  // there is no answer to "is this person allowed here" until the check runs.
  if (!authReady) return null


  // Define public pages that should NOT have Navbar and Header
  const publicPages = ['/login', '/signup', '/verify-signup', '/forgot-password', '/reset-password']
  // "/" is the landing page (no app shell) for a logged-out visitor, but
  // becomes Home (with the shell) once logged in.
  const isPublicPage = publicPages.includes(location.pathname) || (location.pathname === '/' && !user)

  return (
    <>
      {/* Only show Navbar on non-public pages */}
      {!isPublicPage && <Navbar />}
      
      {/* Use different containers based on page type */}
      <div className={!isPublicPage ? "main-content" : "full-page-content"}>
        {/* Only show Header on non-public pages */}
        {!isPublicPage && <Header />}
        <div className='pages'>
          {/* Reserves the route area while a split chunk loads, so the shell
              does not collapse and re-expand (which would register as CLS). */}
          <Suspense fallback={<div className="route-fallback" />}>
          <Routes>
            <Route
              path="/"
              element={user ? <Home /> : <LandingPage />}
            />

            <Route
              path="/configuration"
              element={<Navigate to="/configuration/Thresholds" replace />}
            />

            <Route
              path="/analytics"
              element={user ? <Analytics /> : <Navigate to="/login" />}
            />

            <Route
              path="/classroomrecords"
              element={user ? <ClassroomRecords /> : <Navigate to="/login" />}
            />

            <Route
              path="/alerts-and-notifications"
              element={user ? <AlertsAndNotifications /> : <Navigate to="/login" />}
            />

            <Route
              path="/connect-sensor"
              element={user ? <ConnectSensor /> : <Navigate to="/login" />}
            />

            <Route
              path="/profile"
              element={user ? <Profile /> : <Navigate to="/login" />}
            />

            <Route
              path="/device/:deviceId"
              element={user ? <DeviceDetail /> : <Navigate to="/login" />}
            />
            
            {/* Intentionally unguarded — a public kiosk/signage display, no login required */}
            <Route
              path="/bulletin-board"
              element={<BulletinBoard />}
            />

            <Route
              path="/configuration/Thresholds"
              element={user ? <Thresholds /> : <Navigate to="/login" />}
            />

            <Route
              path="/configuration/WebBulletinBoard"
              element={user ? <WebBulletinBoard /> : <Navigate to="/login" />}
            />

            {/* Intentionally unguarded — a public kiosk/signage display, no login required */}
            <Route
              path="/animation-viewer"
              element={<AnimationViewer />}
            />

            <Route
              path="/auditlog"
              element={user ? <Auditlog /> : <Navigate to="/login" />}
            />

            <Route
              path="/usermanagement"
              element={user ? <UserManagement /> : <Navigate to="/login" />}
            />

            <Route
              path="/device-management"
              element={user ? <DeviceManagement /> : <Navigate to="/login" />}
            />

            <Route
              path="/login"
              element={!user ? <Login /> : <Navigate to="/" />}
            />
            
            <Route
              path="/signup"
              element={!user ? <Signup /> : <Navigate to="/" />}
            />

            <Route
              path="/verify-signup"
              element={!user ? <VerifySignup /> : <Navigate to="/" />}
            />

            <Route
              path="/forgot-password"
              element={!user ? <ForgotPassword /> : <Navigate to="/" />}
            />

            <Route
              path="/reset-password"
              element={!user ? <ResetPassword /> : <Navigate to="/" />}
            />
          </Routes>
          </Suspense>
        </div>
      </div>
    </>
  )
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}

export default App;