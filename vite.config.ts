import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Define __dirname for ESM environments as it is not available by default
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => ({
  envPrefix: [
    'VITE_APP_',
    'VITE_PUBLIC_',
    'VITE_SENTRY_',
    'VITE_STAGE',
    'VITE_FUND',
    'VITE_DRIVE_RETENTION',
    'VITE_GDRIVE_ROOT_FOLDER_ID',
    'VITE_PAPER_MODE',
    'VITE_TELEGRAM_DIRECT_FIRST'
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // Do not inline API keys/tokens through Vite `define`.
  // Headless automation injects required runtime credentials into
  // `window.__ALPHA_RUNTIME_ENV__`; production should use server-side API
  // proxies rather than client-exposed `VITE_*` secrets.
  define: {},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
}));
