
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentryClient } from './services/sentryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initSentryClient();

if (typeof window !== "undefined") {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("sentrySmoke") === "1") {
    const smokeId = `SENTRY_FRONT_SMOKE_${Date.now()}`;
    setTimeout(() => {
      throw new Error(smokeId);
    }, 0);
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
