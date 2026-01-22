
import { ApiProvider } from './types';

export const API_CONFIGS = [
  { provider: ApiProvider.ALPACA, key: 'PKHWDYDOEWWLYZKMUG9L' },
  { provider: ApiProvider.PERPLEXITY, key: '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' },
  { provider: ApiProvider.ALPHA_VANTAGE, key: '8PBTS3IDZM85B3QE' },
  { provider: ApiProvider.FINNHUB, key: 'd2pjjgpr01qnf9nlc7ngd2pjjgpr01qnf9nlc7o0' },
  { provider: ApiProvider.TWELVE_DATA, key: '5ef1dfe22fe7463688783c6787e8f2bf' },
  { provider: ApiProvider.POLYGON, key: 'ArKrr9dmI2FxH71B_YTSWk8YXC2AG9KQ' },
  { provider: ApiProvider.GOOGLE_DRIVE, key: 'AIzaSyDr7G8WTVng50RKGb9so8I4HV79eC1C-LY' },
  { provider: ApiProvider.GEMINI, key: 'AIzaSyB0In6x4UnMtNFXAUqJfF-fCD1lzPQZtb8' },
  { provider: ApiProvider.CHATGPT, key: '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' }
];

export const GOOGLE_DRIVE_TARGET = {
  account: 'InnocentBae@gmail.com',
  rootFolder: '/US_Alpha_Seeker',
  subFolder: '/Stage0_Universe_Data',
  folderId: '1TVqBE5fEIO4fK4Zyid0kloKsM6316UQD', // 사용자 제공 폴더 ID
  lastSync: '2024-05-21 14:22:05'
};

export const STAGES_FLOW = [
  { id: 0, label: '0: Universe Gathering' },
  { id: 2, label: '2: Quality Filter' },
  { id: 3, label: '3: Fundamentals' },
  { id: 4, label: '4: Technicals' },
  { id: 5, label: '5: ICT Smart Money' },
  { id: 6, label: '6: AI Final Alpha' }
];
