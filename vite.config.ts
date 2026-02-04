
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Define __dirname for ESM environments as it is not available by default
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.PERPLEXITY_API_KEY': JSON.stringify(env.PERPLEXITY_API_KEY),
        'process.env.RAPID_API_KEY': JSON.stringify(env.RAPID_API_KEY),
        'process.env.POLYGON_API_KEY': JSON.stringify(env.POLYGON_API_KEY),
        'process.env.ALPACA_KEY': JSON.stringify(env.ALPACA_KEY),
        'process.env.FINNHUB_KEY': JSON.stringify(env.FINNHUB_KEY),
        'process.env.FMP_KEY': JSON.stringify(env.FMP_KEY),
        'process.env.TWELVE_DATA_KEY': JSON.stringify(env.TWELVE_DATA_KEY),
        'process.env.ALPHA_VANTAGE_KEY': JSON.stringify(env.ALPHA_VANTAGE_KEY),
        'process.env.TELEGRAM_TOKEN': JSON.stringify(env.TELEGRAM_TOKEN),
        'process.env.TELEGRAM_CHAT_ID': JSON.stringify(env.TELEGRAM_CHAT_ID),
        'process.env.GDRIVE_CLIENT_ID': JSON.stringify(env.GDRIVE_CLIENT_ID),
        // Fallback for direct API Key usage if needed, though Client ID is preferred for OAuth
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY) 
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
