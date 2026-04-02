
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureClientException, captureClientMessage, flushClientEvents, initSentryClient } from './services/sentryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initSentryClient();

if (typeof window !== "undefined") {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("sentrySmoke") === "1") {
    const smokeId = `SENTRY_FRONT_SMOKE_${Date.now()}`;
    const smokeContext = {
      source: "url_smoke",
      path: window.location.pathname,
      href: window.location.href,
      smokeId
    };
    const smokeTags = {
      smoke: "frontend",
      smokeSource: "url_param"
    };

    captureClientException(new Error(smokeId), smokeContext, smokeTags);
    captureClientMessage(smokeId, smokeContext, smokeTags, "error");
    void flushClientEvents(3000).then((ok) => {
      console.info(`[SENTRY_SMOKE_FLUSH] ${smokeId} ok=${ok}`);
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
