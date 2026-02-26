
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

// [HYBRID CONFIG] Priority: Environment Variables (GitHub Actions) > Hardcoded Fallback (Local Dev)
const getEnvVar = (key: string) => {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
        // @ts-ignore
        return import.meta.env[key];
    }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return '';
};

export const TELEGRAM_CONFIG = {
  TOKEN: getEnvVar('TELEGRAM_TOKEN') || process.env.TELEGRAM_TOKEN || '8468786480:AAFytUe-qHOfhsagEwTwDxn0l5vSxQbKmzs',
  // [FIX] Hardcoded Chat ID to ensure delivery as per user validation
  CHAT_ID: '-1003800785574'
};

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node (Data Feeders)
  { 
    provider: ApiProvider.RAPID_API, 
    key: getEnvVar('RAPID_API_KEY') || '9732bdf9b4msh26c34f61e9a7fc4p1eca3ajsncd56ae81b71e', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.POLYGON, 
    key: getEnvVar('POLYGON_API_KEY') || 'ArKrr9dmI2FxH71B_YTSWk8YXC2AG9KQ', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPACA, 
    key: getEnvVar('ALPACA_KEY') || 'PKHWDYDOEWWLYZKMUG9L', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FINNHUB, 
    key: getEnvVar('FINNHUB_KEY') || 'd2pjjgpr01qnf9nlc7ngd2pjjgpr01qnf9nlc7o0', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FMP, 
    key: getEnvVar('FMP_KEY') || 'dMhbH7OaYJKXeCCpCp001RQrq55259p7', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.TWELVE_DATA, 
    key: getEnvVar('TWELVE_DATA_KEY') || '5ef1dfe22fe7463688783c6787e8f2bf', 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPHA_VANTAGE, 
    key: getEnvVar('ALPHA_VANTAGE_KEY') || '8PBTS3IDZM85B3QE', 
    category: 'Acquisition' 
  },
  
  // Intelligence Node (AI Brains)
  { 
    provider: ApiProvider.GEMINI, 
    key: getEnvVar('GEMINI_API_KEY') || getEnvVar('API_KEY') || 'AIzaSyDDjIqQXQzBo4Grq3e2CICk2HJSmFA9yxc', 
    category: 'Intelligence' 
  },
  { 
    provider: ApiProvider.PERPLEXITY, 
    key: getEnvVar('PERPLEXITY_API_KEY') || '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', 
    category: 'Intelligence' 
  },
  
  // Infrastructure Node (Storage)
  { 
    provider: ApiProvider.GOOGLE_DRIVE, 
    // [CRITICAL REVERT] Restored original API Key format for status checks.
    key: getEnvVar('GDRIVE_API_KEY') || 'AIzaSyDr7G8WTVng50RKGb9so8I4HV79eC1C-LY', 
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
  reportSubFolder: 'Report',
  reportsArchiveFolder: 'Stage2_Financial_Reports',
  // [NEW] V12 Engine Data Map Folders
  systemMapSubFolder: 'System_Identity_Maps',
  financialDailyFolder: 'Financial_Data_Daily', // Daily Metrics (A-Z)
  financialHistoryFolder: 'Financial_Data_History_5Y' // Historical Data (A-Z)
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

/**
 * [STRATEGY_CONTROL_PANEL] 
 * 시스템 전체의 전략적 임계값을 관리하는 중앙 제어판입니다.
 */
export const STRATEGY_CONFIG = {
  RSI_PENALTY_THRESHOLD: 85,       // RSI 감점 시작 기준 (이 수치를 넘으면 과열로 판단)
  VIX_RISK_OFF_LEVEL: 22,          // VIX 방어 모드 전환 기준 (이 수치를 넘으면 보수적 운용)
  MIN_REVENUE_GROWTH_FOR_PEG: 0,   // PEG 신뢰도를 보장하기 위한 최소 매출 성장률
  MAX_KELLY_WEIGHT: 0.20,          // 단일 종목에 할당 가능한 최대 투자 비중 (20%)
  SENTIMENT_REVERSAL_THRESHOLD: 0.9, // 뉴스 감성이 너무 높을 때 경계하는 역발상 임계값

  // [ICT ALGORITHM PARAMETERS]
  ICT_OTE_LEVEL: 0.705,            // 최적 진입 타점 (Optimal Trade Entry) 피보나치 레벨
  ICT_EQUILIBRIUM: 0.5,            // 프리미엄/디스카운트 구간 기준점
  DISCOUNT_BONUS: 10,              // 할인 구간(Discount Zone) 가산점

  // [RISK MANAGEMENT REFINED]
  STOP_LOSS_BUFFER: 0.015,         // 손절가 설정을 위한 노이즈 버퍼 (1.5%)
  MAX_SECTOR_COUNT: 3,             // 동일 섹터 최대 허용 수 (페널티 시작점)
  SECTOR_PENALTY_RATE: 0.05        // 섹터 쏠림 방지 페널티 비율 (5%)
};
