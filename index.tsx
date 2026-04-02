
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureClientException, initSentryClient } from './services/sentryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initSentryClient();

if (typeof window !== "undefined") {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("sentrySmoke") === "1") {
    const smokeId = `SENTRY_FRONT_SMOKE_${Date.now()}`;
    captureClientException(new Error(smokeId), {
      source: "url_smoke",
      path: window.location.pathname
    });
    console.info(`[SENTRY_SMOKE_SENT] ${smokeId}`);
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
