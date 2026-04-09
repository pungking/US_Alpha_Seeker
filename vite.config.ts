
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
      'process.env.HUGGINGFACE_API_KEY': JSON.stringify(env.HUGGINGFACE_API_KEY),
      'process.env.HUGGINGFACE_ENABLE_ADVISORY': JSON.stringify(env.HUGGINGFACE_ENABLE_ADVISORY),
      'process.env.HUGGINGFACE_ADVISORY_MAX_CANDIDATES': JSON.stringify(env.HUGGINGFACE_ADVISORY_MAX_CANDIDATES),
      'process.env.HUGGINGFACE_BLEND_ENABLED': JSON.stringify(env.HUGGINGFACE_BLEND_ENABLED),
      'process.env.HUGGINGFACE_BLEND_WEIGHT': JSON.stringify(env.HUGGINGFACE_BLEND_WEIGHT),
      'process.env.HUGGINGFACE_BLEND_MAX_DELTA': JSON.stringify(env.HUGGINGFACE_BLEND_MAX_DELTA),
      'process.env.VITE_HUGGINGFACE_ENABLE_ADVISORY': JSON.stringify(env.VITE_HUGGINGFACE_ENABLE_ADVISORY),
      'process.env.VITE_HUGGINGFACE_BLEND_ENABLED': JSON.stringify(env.VITE_HUGGINGFACE_BLEND_ENABLED),
      'process.env.VITE_HUGGINGFACE_BLEND_WEIGHT': JSON.stringify(env.VITE_HUGGINGFACE_BLEND_WEIGHT),
      'process.env.VITE_HUGGINGFACE_BLEND_MAX_DELTA': JSON.stringify(env.VITE_HUGGINGFACE_BLEND_MAX_DELTA),
      'process.env.RAPID_API_KEY': JSON.stringify(env.RAPID_API_KEY),
      'process.env.POLYGON_API_KEY': JSON.stringify(env.POLYGON_API_KEY),
      'process.env.ALPACA_KEY': JSON.stringify(env.ALPACA_KEY),
      'process.env.FINNHUB_KEY': JSON.stringify(env.FINNHUB_KEY),
      'process.env.FMP_KEY': JSON.stringify(env.FMP_KEY),
      'process.env.TWELVE_DATA_KEY': JSON.stringify(env.TWELVE_DATA_KEY),
      'process.env.ALPHA_VANTAGE_KEY': JSON.stringify(env.ALPHA_VANTAGE_KEY),
      'process.env.TELEGRAM_TOKEN': JSON.stringify(env.TELEGRAM_TOKEN),
      'process.env.TELEGRAM_CHAT_ID': JSON.stringify(env.TELEGRAM_CHAT_ID),
      'process.env.TELEGRAM_SIMULATION_CHAT_ID': JSON.stringify(env.TELEGRAM_SIMULATION_CHAT_ID),
      'process.env.TELEGRAM_ALERT_CHAT_ID': JSON.stringify(env.TELEGRAM_ALERT_CHAT_ID),
      'process.env.TELEGRAM_ADMIN_CHAT_ID': JSON.stringify(env.TELEGRAM_ADMIN_CHAT_ID),
      'process.env.PAPER_MODE': JSON.stringify(env.PAPER_MODE),
      'process.env.APPROVAL_REQUIRED': JSON.stringify(env.APPROVAL_REQUIRED),      
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
