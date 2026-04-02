
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentryClient } from './services/sentryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initSentryClient();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
