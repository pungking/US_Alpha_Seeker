
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

// [HYBRID CONFIG] Priority: Environment Variables (GitHub Actions) > Hardcoded Fallback (Local Dev)
export const TELEGRAM_CONFIG = {
  TOKEN: process.env.TELEGRAM_TOKEN || '8468786480:AAFytUe-qHOfhsagEwTwDxn0l5vSxQbKmzs',
  CHAT_ID: process.env.TELEGRAM_CHAT_ID || '1281749368'
};

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node (Data Feeders)
  { 
    provider: ApiProvider.RAPID_API, 
    key: process.env.RAPID_API_KEY || '9732bdf9b4msh26c34f61e9a7fc4p1eca3ajsncd56ae81b71e', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.POLYGON, 
    key: process.env.POLYGON_API_KEY || 'ArKrr9dmI2FxH71B_YTSWk8YXC2AG9KQ', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPACA, 
    key: process.env.ALPACA_KEY || 'PKHWDYDOEWWLYZKMUG9L', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FINNHUB, 
    key: process.env.FINNHUB_KEY || 'd2pjjgpr01qnf9nlc7ngd2pjjgpr01qnf9nlc7o0', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FMP, 
    key: process.env.FMP_KEY || 'dMhbH7OaYJKXeCCpCp001RQrq55259p7', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.TWELVE_DATA, 
    key: process.env.TWELVE_DATA_KEY || '5ef1dfe22fe7463688783c6787e8f2bf', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPHA_VANTAGE, 
    key: process.env.ALPHA_VANTAGE_KEY || '8PBTS3IDZM85B3QE', 
    category: 'Acquisition' 
  },
  
  // Intelligence Node (AI Brains)
  { 
    provider: ApiProvider.GEMINI, 
    key: process.env.GEMINI_API_KEY || 'AIzaSyDDjIqQXQzBo4Grq3e2CICk2HJSmFA9yxc', 
    category: 'Intelligence' 
  },
  { 
    provider: ApiProvider.PERPLEXITY, 
    key: process.env.PERPLEXITY_API_KEY || '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', 
    category: 'Intelligence' 
  },
  
  // Infrastructure Node (Storage)
  { 
    provider: ApiProvider.GOOGLE_DRIVE, 
    // [CRITICAL REVERT] Restored original API Key format for status checks.
    // Do NOT replace with Client ID here; Client ID is handled in UniverseGathering.tsx
    key: process.env.GDRIVE_API_KEY || 'AIzaSyDr7G8WTVng50RKGb9so8I4HV79eC1C-LY', 
    category: 'Infrastructure' 
  }
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
