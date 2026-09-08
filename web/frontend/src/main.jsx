import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthContextProvider } from './context/AuthContext.jsx';
import { initAirQualityBands } from './utils/airQualityGuidance.js';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Paint immediately using the bundled fallback table, which airQualityGuidance
// already applied synchronously at module load. Gating the first render on the
// served table meant a blank page for however long the API took to answer — and
// that API is a free-tier instance that cold starts, so it was routinely
// seconds of white screen for the sake of a colour difference that only exists
// if someone edited the backend table without regenerating the fallback.
//
// A fresh element is built per call on purpose: re-rendering the *same* element
// reference lets React bail out, and then the served colours would never land.
const renderApp = () => root.render(
  <React.StrictMode>
    <AuthContextProvider>
      <App />
    </AuthContextProvider>
  </React.StrictMode>
);

renderApp();

// CATEGORY_COLORS is mutated in place, so once the canonical table arrives a
// plain re-render is enough to pick it up — there is no state to thread through.
initAirQualityBands().finally(renderApp);

