
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

// [NEW] Telegram Config
export const TELEGRAM_CONFIG = {
  TOKEN: '8468786480:AAFytUe-qHOfhsagEwTwDxn0l5vSxQbKmzs',
  CHAT_ID: '1281749368'
};

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node (Data Feeders)
  { provider: ApiProvider.RAPID_API, key: '9732bdf9b4msh26c34f61e9a7fc4p1eca3ajsncd56ae81b71e', category: 'Acquisition' },
  { provider: ApiProvider.POLYGON, key: 'ArKrr9dmI2FxH71B_YTSWk8YXC2AG9KQ', category: 'Acquisition' },
  { provider: ApiProvider.ALPACA, key: 'PKHWDYDOEWWLYZKMUG9L', category: 'Acquisition' },
  { provider: ApiProvider.FINNHUB, key: 'd2pjjgpr01qnf9nlc7ngd2pjjgpr01qnf9nlc7o0', category: 'Acquisition' },
  { provider: ApiProvider.FMP, key: 'dMhbH7OaYJKXeCCpCp001RQrq55259p7', category: 'Acquisition' },
  { provider: ApiProvider.TWELVE_DATA, key: '5ef1dfe22fe7463688783c6787e8f2bf', category: 'Acquisition' },
  { provider: ApiProvider.ALPHA_VANTAGE, key: '8PBTS3IDZM85B3QE', category: 'Acquisition' },
  
  // Intelligence Node (AI Brains)
  { provider: ApiProvider.GEMINI, key: 'AIzaSyDDjIqQXQzBo4Grq3e2CICk2HJSmFA9yxc', category: 'Intelligence' },
  { provider: ApiProvider.PERPLEXITY, key: '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', category: 'Intelligence' },
  
  // Infrastructure Node (Storage)
  { provider: ApiProvider.GOOGLE_DRIVE, key: 'AIzaSyDr7G8WTVng50RKGb9so8I4HV79eC1C-LY', category: 'Infrastructure' }
];

export const GOOGLE_DRIVE_TARGET = {
  account: 'InnocentBae@gmail.com',
  rootFolderName: 'US_Alpha_Seeker',
  rootFolderId: '', // 삭제된 프로젝트 ID이므로 비워둠으로써 자동 재생성 유도
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
