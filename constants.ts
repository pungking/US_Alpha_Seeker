
import { ApiProvider } from './types';

export const GITHUB_REPO = "https://github.com/pungking/US_Alpha_Seeker";
export const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";

export interface ApiConfig {
  provider: ApiProvider;
  key: string;
  category: 'Acquisition' | 'Intelligence' | 'Infrastructure';
}

// [SECURITY POLICY] Env-only credentials (no hardcoded secret fallback).
const getEnvVar = (key: string): string => {
    try {
        const readDefinedProcessEnv = (targetKey: string): string => {
            if (typeof process === 'undefined' || !process.env) return '';
            // Use static property access so Vite `define` can inline injected values.
            const directMap: Record<string, string | undefined> = {
                GEMINI_API_KEY: process.env.GEMINI_API_KEY,
                API_KEY: process.env.API_KEY,
                PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
                RAPID_API_KEY: process.env.RAPID_API_KEY,
                POLYGON_API_KEY: process.env.POLYGON_API_KEY,
                ALPACA_KEY: process.env.ALPACA_KEY,
                FINNHUB_KEY: process.env.FINNHUB_KEY,
                FMP_KEY: process.env.FMP_KEY,
                TWELVE_DATA_KEY: process.env.TWELVE_DATA_KEY,
                ALPHA_VANTAGE_KEY: process.env.ALPHA_VANTAGE_KEY,
                HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
                GDRIVE_API_KEY: process.env.GDRIVE_API_KEY,
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
                TELEGRAM_SIMULATION_CHAT_ID: process.env.TELEGRAM_SIMULATION_CHAT_ID,
                GITHUB_PAT: process.env.GITHUB_PAT,
                GH_PAT: process.env.GH_PAT,
                SIDECAR_DISPATCH_TOKEN: process.env.SIDECAR_DISPATCH_TOKEN
            };
            return directMap[targetKey] || '';
        };

        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            const viteKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
            const viteDirect = import.meta.env[viteKey] || import.meta.env[key] || '';
            if (viteDirect) return viteDirect;

            // Static access for common keys to ensure Vite includes them
            if (key === 'GEMINI_API_KEY') return import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
            if (key === 'API_KEY') return import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || readDefinedProcessEnv('API_KEY');
            if (key === 'PERPLEXITY_API_KEY') return import.meta.env.VITE_PERPLEXITY_API_KEY || import.meta.env.PERPLEXITY_API_KEY || '';
            if (key === 'HUGGINGFACE_API_KEY') return import.meta.env.HUGGINGFACE_API_KEY || readDefinedProcessEnv('HUGGINGFACE_API_KEY');
            if (key === 'TELEGRAM_TOKEN') return import.meta.env.VITE_TELEGRAM_TOKEN || import.meta.env.TELEGRAM_TOKEN || '';
            if (key === 'TELEGRAM_CHAT_ID') return import.meta.env.VITE_TELEGRAM_CHAT_ID || import.meta.env.TELEGRAM_CHAT_ID || '';
            if (key === 'TELEGRAM_SIMULATION_CHAT_ID') return import.meta.env.VITE_TELEGRAM_SIMULATION_CHAT_ID || import.meta.env.TELEGRAM_SIMULATION_CHAT_ID || '';
            const definedProcessValue = readDefinedProcessEnv(key);
            if (definedProcessValue) return definedProcessValue;
            
            // Fallback to dynamic access
            return import.meta.env[key] || '';
        }
        if (typeof process !== 'undefined' && process.env) {
            const nodeViteKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
            return process.env[nodeViteKey] || process.env[key] || readDefinedProcessEnv(key);
        }
    } catch (e) {}
    return '';
};

const parseNumberEnv = (keys: string[], fallback: number): number => {
    for (const key of keys) {
        const raw = String(getEnvVar(key) || '').trim();
        if (!raw) continue;
        const num = Number(raw);
        if (Number.isFinite(num)) return num;
    }
    return fallback;
};

const parseEnumEnv = <T extends string>(keys: string[], allowed: readonly T[], fallback: T): T => {
    const allowedSet = new Set(allowed);
    for (const key of keys) {
        const raw = String(getEnvVar(key) || '').trim().toUpperCase();
        if (!raw) continue;
        if (allowedSet.has(raw as T)) return raw as T;
    }
    return fallback;
};

const parseBooleanEnv = (keys: string[], fallback: boolean): boolean => {
    for (const key of keys) {
        const raw = String(getEnvVar(key) || '').trim().toLowerCase();
        if (!raw) continue;
        if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
        if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
    }
    return fallback;
};

// ============================================================
// [GITHUB DISPATCH CONFIG]
// Stage 3 완료 후 → US_Alpha_Seeker_Harvester 워크플로우 트리거
// main.yml types: [stage3_completed] 와 일치
// ============================================================
export const GITHUB_DISPATCH_CONFIG = {
  OWNER: 'pungking',
  REPO: 'US_Alpha_Seeker_Harvester',
  EVENT_TYPE: 'stage3_completed',
  TOKEN: getEnvVar('GITHUB_PAT') || getEnvVar('GH_PAT') || getEnvVar('SIDECAR_DISPATCH_TOKEN'),
  get API_URL() {
    return `https://api.github.com/repos/${this.OWNER}/${this.REPO}/dispatches`;
  }
};

export const TELEGRAM_CONFIG = {
  TOKEN: getEnvVar('TELEGRAM_TOKEN') || process.env.TELEGRAM_TOKEN || '',
  CHAT_ID: getEnvVar('TELEGRAM_CHAT_ID') || process.env.TELEGRAM_CHAT_ID || '',
  // [SIMULATION CHANNEL] Backtest/simulation execution events are routed here.
  SIMULATION_CHAT_ID: getEnvVar('TELEGRAM_SIMULATION_CHAT_ID') || process.env.TELEGRAM_SIMULATION_CHAT_ID || ''
};

export const API_CONFIGS: ApiConfig[] = [
  // Acquisition Node (Data Feeders)
  { 
    provider: ApiProvider.RAPID_API, 
    key: getEnvVar('RAPID_API_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.POLYGON, 
    key: getEnvVar('POLYGON_API_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPACA, 
    key: getEnvVar('ALPACA_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FINNHUB, 
    key: getEnvVar('FINNHUB_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.FMP, 
    key: getEnvVar('FMP_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.TWELVE_DATA, 
    key: getEnvVar('TWELVE_DATA_KEY'), 
    category: 'Acquisition' 
  },
  { 
    provider: ApiProvider.ALPHA_VANTAGE, 
    key: getEnvVar('ALPHA_VANTAGE_KEY'), 
    category: 'Acquisition' 
  },
  
  // Intelligence Node (AI Brains)
  { 
    provider: ApiProvider.GEMINI, 
    key: getEnvVar('GEMINI_API_KEY') || getEnvVar('API_KEY'), 
    category: 'Intelligence' 
  },
  { 
    provider: ApiProvider.PERPLEXITY, 
    key: getEnvVar('PERPLEXITY_API_KEY'), 
    category: 'Intelligence' 
  },
  
  // Infrastructure Node (Storage)
  { 
    provider: ApiProvider.GOOGLE_DRIVE, 
    key: getEnvVar('GDRIVE_API_KEY'), 
    category: 'Infrastructure' 
  }
];

// [HF READY] Keep Hugging Face settings isolated until service integration is enabled.
export const HUGGINGFACE_CONFIG = {
  API_KEY: getEnvVar('HUGGINGFACE_API_KEY'),
  API_BASE_URL: getEnvVar('HUGGINGFACE_API_BASE_URL') || 'https://api-inference.huggingface.co/models',
  FINBERT_MODEL: getEnvVar('HUGGINGFACE_FINBERT_MODEL') || 'ProsusAI/finbert',
  SUMMARY_MODEL: getEnvVar('HUGGINGFACE_SUMMARY_MODEL') || 'facebook/bart-large-cnn'
} as const;

// [C1 FIX] Centralized Gemini model contract to avoid per-file drift.
const normalizeGeminiModel = (model: string, fallback: string): string => {
  const legacyAlias: Record<string, string> = {
    // Legacy / retired aliases -> currently supported family
    'gemini-1.5-pro': 'gemini-2.5-pro',
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash-latest': 'gemini-2.5-flash',
    'gemini-2.0-pro-exp': 'gemini-2.5-pro',
    'gemini-2.0-flash': 'gemini-2.5-flash',
    // Free-tier-safe remaps for stale env values
    'gemini-3.1-pro-preview': 'gemini-3-flash',
    // v1beta + account tier combinations where 3-flash is unavailable
    'gemini-3-flash': 'gemini-2.5-flash',
    'gemini-3-flash-latest': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-flash'
  };
  const normalized = legacyAlias[model] || model;
  return normalized || fallback;
};

const geminiPrimaryModel = normalizeGeminiModel(
  getEnvVar('GEMINI_PRIMARY_MODEL') || getEnvVar('VITE_GEMINI_PRIMARY_MODEL'),
  'gemini-2.5-flash'
);

const geminiFallbackModel = normalizeGeminiModel(
  getEnvVar('GEMINI_FALLBACK_MODEL') || getEnvVar('VITE_GEMINI_FALLBACK_MODEL'),
  'gemini-2.5-flash'
);

const geminiFastModel = normalizeGeminiModel(
  getEnvVar('GEMINI_FAST_MODEL') || getEnvVar('VITE_GEMINI_FAST_MODEL'),
  'gemini-2.5-flash'
);

const geminiLiteModel = normalizeGeminiModel(
  getEnvVar('GEMINI_LITE_MODEL') || getEnvVar('VITE_GEMINI_LITE_MODEL'),
  'gemini-2.5-flash-lite'
);

const geminiModelChain = Array.from(
  new Set([geminiPrimaryModel, geminiFallbackModel, geminiFastModel, geminiLiteModel].filter(Boolean))
);

export const GEMINI_MODELS = {
  PRIMARY: geminiPrimaryModel,
  FALLBACK: geminiFallbackModel,
  FAST: geminiFastModel,
  LITE: geminiLiteModel,
  CHAIN: geminiModelChain
} as const;

export const GOOGLE_DRIVE_TARGET = {
  account: 'InnocentBae@gmail.com',
  rootFolderName: 'US_Alpha_Seeker',
  // 5-A: env-only root folder id (no hardcoded fallback).
  rootFolderId: getEnvVar('GDRIVE_ROOT_FOLDER_ID') || getEnvVar('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
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
  financialHistoryFolder: 'Financial_Data_History_5Y', // Historical Data (A-Z)
  financialOhlcvFolder: 'Financial_Data_OHLCV',
  stage4ReadyFile: 'LATEST_STAGE4_READY.json'
};

if (!GOOGLE_DRIVE_TARGET.rootFolderId) {
  console.warn('[CONFIG] Missing GDRIVE_ROOT_FOLDER_ID (or GOOGLE_DRIVE_ROOT_FOLDER_ID). Drive operations will fail until configured.');
}

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

  // [ALPHA SCORING] H1 fix + calibration guard
  // RISK_OFF base weights (normalized to sum=1.0)
  RISK_OFF_FUND_WEIGHT: 0.6363636364,
  RISK_OFF_TECH_WEIGHT: 0.2727272727,
  RISK_OFF_ICT_WEIGHT: 0.0909090909,
  ALPHA_SCORE_MIN: 0,
  ALPHA_SCORE_MAX: 100,

  // [ICT ALGORITHM PARAMETERS]
  ICT_OTE_LEVEL: 0.705,            // 최적 진입 타점 (Optimal Trade Entry) 피보나치 레벨
  ICT_EQUILIBRIUM: 0.5,            // 프리미엄/디스카운트 구간 기준점
  DISCOUNT_BONUS: 10,              // 할인 구간(Discount Zone) 가산점
  ICT_RANGE_LOOKBACK_BARS: 60,     // C9: OTE 계산용 최근 스윙 구간
  ICT_STOP_LOOKBACK_BARS: 20,      // C9: 손절 기준 최근 스윙 저점 구간
  ICT_STOP_ATR_MULTIPLIER: 1.0,    // C9: ATR 배수 (최근 저점 하단 버퍼)

  // [H8] TTM Squeeze profile control
  // Profile mode: STATIC | VIX_DYNAMIC | ADAPTIVE_SHADOW | ADAPTIVE_ACTIVE
  TTM_SQUEEZE_KC_PROFILE_MODE: parseEnumEnv(
    ['VITE_TTM_SQUEEZE_KC_PROFILE_MODE', 'TTM_SQUEEZE_KC_PROFILE_MODE'],
    ['STATIC', 'VIX_DYNAMIC', 'ADAPTIVE_SHADOW', 'ADAPTIVE_ACTIVE'] as const,
    'STATIC'
  ),
  TTM_SQUEEZE_BB_STD_MULT: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_BB_STD_MULT', 'TTM_SQUEEZE_BB_STD_MULT'],
    2.0
  ),
  TTM_SQUEEZE_KC_ATR_MULT_STRICT: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_KC_ATR_MULT_STRICT', 'TTM_SQUEEZE_KC_ATR_MULT_STRICT'],
    1.25
  ),
  TTM_SQUEEZE_KC_ATR_MULT_DEFAULT: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_KC_ATR_MULT_DEFAULT', 'TTM_SQUEEZE_KC_ATR_MULT_DEFAULT'],
    1.5
  ),
  TTM_SQUEEZE_KC_ATR_MULT_WIDE: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_KC_ATR_MULT_WIDE', 'TTM_SQUEEZE_KC_ATR_MULT_WIDE'],
    2.0
  ),
  TTM_SQUEEZE_VIX_STRICT_MIN: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_VIX_STRICT_MIN', 'TTM_SQUEEZE_VIX_STRICT_MIN'],
    24
  ),
  TTM_SQUEEZE_VIX_WIDE_MAX: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_VIX_WIDE_MAX', 'TTM_SQUEEZE_VIX_WIDE_MAX'],
    18
  ),
  TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES', 'TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES'],
    600
  ),
  TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MIN: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MIN', 'TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MIN'],
    0.14
  ),
  TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MAX: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MAX', 'TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MAX'],
    0.28
  ),
  TTM_SQUEEZE_ADAPTIVE_STEP: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_STEP', 'TTM_SQUEEZE_ADAPTIVE_STEP'],
    0.05
  ),
  TTM_SQUEEZE_ADAPTIVE_MIN_KC: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_MIN_KC', 'TTM_SQUEEZE_ADAPTIVE_MIN_KC'],
    1.1
  ),
  TTM_SQUEEZE_ADAPTIVE_MAX_KC: parseNumberEnv(
    ['VITE_TTM_SQUEEZE_ADAPTIVE_MAX_KC', 'TTM_SQUEEZE_ADAPTIVE_MAX_KC'],
    2.2
  ),

  // [H10] Stage4 OHLCV API fallback control
  STAGE4_API_FALLBACK_ENABLED: parseBooleanEnv(
    ['VITE_STAGE4_API_FALLBACK_ENABLED', 'STAGE4_API_FALLBACK_ENABLED'],
    false
  ),
  STAGE4_API_FALLBACK_MAX: parseNumberEnv(
    ['VITE_STAGE4_API_FALLBACK_MAX', 'STAGE4_API_FALLBACK_MAX'],
    50
  ),
  STAGE4_DATA_INTEGRITY_MODE: parseEnumEnv(
    ['VITE_STAGE4_DATA_INTEGRITY_MODE', 'STAGE4_DATA_INTEGRITY_MODE'],
    ['STRICT', 'RELAXED'] as const,
    'STRICT'
  ),
  STAGE4_NON_DRIVE_SCORE_CAP: parseNumberEnv(
    ['VITE_STAGE4_NON_DRIVE_SCORE_CAP', 'STAGE4_NON_DRIVE_SCORE_CAP'],
    58
  ),
  STAGE4_REQUIRE_DRIVE_FOR_BREAKOUT: parseBooleanEnv(
    ['VITE_STAGE4_REQUIRE_DRIVE_FOR_BREAKOUT', 'STAGE4_REQUIRE_DRIVE_FOR_BREAKOUT'],
    true
  ),

  // [RISK MANAGEMENT REFINED]
  STOP_LOSS_BUFFER: 0.015,         // 손절가 설정을 위한 노이즈 버퍼 (1.5%)
  MAX_SECTOR_COUNT: 3,             // 동일 섹터 최대 허용 수 (페널티 시작점)
  SECTOR_PENALTY_RATE: 0.05        // 섹터 쏠림 방지 페널티 비율 (5%)
};
