
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

// [SECURE] Telegram Config now uses Environment Variables
export const TELEGRAM_CONFIG = {
  TOKEN: process.env.TELEGRAM_TOKEN || '',
  CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
};

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node (Data Feeders)
  { provider: ApiProvider.RAPID_API, key: process.env.RAPID_API_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.POLYGON, key: process.env.POLYGON_API_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.ALPACA, key: process.env.ALPACA_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.FINNHUB, key: process.env.FINNHUB_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.FMP, key: process.env.FMP_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.TWELVE_DATA, key: process.env.TWELVE_DATA_KEY || '', category: 'Acquisition' },
  { provider: ApiProvider.ALPHA_VANTAGE, key: process.env.ALPHA_VANTAGE_KEY || '', category: 'Acquisition' },
  
  // Intelligence Node (AI Brains)
  { 
    provider: ApiProvider.GEMINI, 
    key: process.env.GEMINI_API_KEY || '', 
    category: 'Intelligence' 
  },
  { 
    provider: ApiProvider.PERPLEXITY, 
    key: process.env.PERPLEXITY_API_KEY || '', 
    category: 'Intelligence' 
  },
  
  // Infrastructure Node (Storage)
  // Google Drive uses OAuth Token via sessionStorage, this key is for legacy/fallback if needed
  { provider: ApiProvider.GOOGLE_DRIVE, key: process.env.GDRIVE_CLIENT_ID || '', category: 'Infrastructure' }
];

export const GOOGLE_DRIVE_TARGET = {
  account: 'InnocentBae@gmail.com',
  rootFolderName: 'US_Alpha_Seeker',
  rootFolderId: '1TVqBE5fEIO4fK4Zyid0kloKsM6316UQD', 
  targetSubFolder: 'Stage0_Universe_Data',
  stage1SubFolder: 'Stage1_Quality_Data',
  stage2SubFolder: 'Stage2_Deep_Quality',
  stage3SubFolder: 'Stage3_Fundamental_Data',
  stage4SubFolder: 'Stage4_Technical_Data',
  stage5SubFolder: 'Stage5_ICT_Data',
  stage6SubFolder: 'Stage6_Alpha_Final',
  reportSubFolder: 'Report'
};

export const STAGES_FLOW = [
  { id: 0, label: '0: Gathering' },
  { id: 1, label: '1: Pre-Filter' },
  { id: 2, label: '2: Quality' },
  { id: 3, label: '3: Funds' },
  { id: 4, label: '4: Techs' },
  { id: 5, label: '5: ICT' },
  { id: 6, label: '6: Alpha' }
];
