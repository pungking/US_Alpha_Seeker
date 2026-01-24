
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node
  { provider: ApiProvider.POLYGON, key: 'ArKrr9dmI2FxH71B_YTSWk8YXC2AG9KQ', category: 'Acquisition' },
  { provider: ApiProvider.ALPACA, key: 'PKHWDYDOEWWLYZKMUG9L', category: 'Acquisition' },
  { provider: ApiProvider.FINNHUB, key: 'd2pjjgpr01qnf9nlc7ngd2pjjgpr01qnf9nlc7o0', category: 'Acquisition' },
  { provider: ApiProvider.TWELVE_DATA, key: '5ef1dfe22fe7463688783c6787e8f2bf', category: 'Acquisition' },
  { provider: ApiProvider.ALPHA_VANTAGE, key: '8PBTS3IDZM85B3QE', category: 'Acquisition' },
  
  // Intelligence Node
  { provider: ApiProvider.GEMINI, key: 'AIzaSyDDjIqQXQzBo4Grq3e2CICk2HJSmFA9yxc', category: 'Intelligence' },
  { provider: ApiProvider.CHATGPT, key: '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', category: 'Intelligence' },
  { provider: ApiProvider.PERPLEXITY, key: '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', category: 'Intelligence' },
  
  // Infrastructure Node
  { provider: ApiProvider.GOOGLE_DRIVE, key: 'AIzaSyDr7G8WTVng50RKGb9so8I4HV79eC1C-LY', category: 'Infrastructure' }
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
  stage6SubFolder: 'Stage6_Alpha_Final'
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
