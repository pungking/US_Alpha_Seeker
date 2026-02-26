
export enum ApiProvider {
  ALPACA = 'Alpaca',
  PERPLEXITY = 'Perplexity',
  ALPHA_VANTAGE = 'Alpha Vantage',
  FINNHUB = 'Finnhub',
  FMP = 'Financial Modeling Prep',
  TWELVE_DATA = 'Twelve Data',
  POLYGON = 'Polygon',
  RAPID_API = 'RapidAPI',
  GOOGLE_DRIVE = 'Google Drive',
  GEMINI = 'Google Gemini',
  NASDAQ = 'Nasdaq Exchange'
}

export interface ApiStatus {
  provider: ApiProvider;
  category?: 'Acquisition' | 'Intelligence' | 'Infrastructure';
  isConnected: boolean;
  latency: number;
  lastChecked: string;
  limitRemaining?: string;
}

export interface TickerData {
  symbol: string;
  name: string;
  exchange: string;
  prevClose: number;
  lastUpdated: string;
}

export interface GatheringStats {
  totalFound: number;
  processed: number;
  failed: number;
  startTime: string;
  elapsedSeconds: number;
  estimatedTimeRemaining: string;
}

// [NEW] RapidAPI Future Expansion Types
export interface MarketNews {
  id: string;
  headline: string;
  description: string;
  publishedTime: string;
  source: string;
  url: string;
  relatedSymbols: string[];
  sentimentScore?: number; // AI Calculated (-100 to 100)
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  estimate: number;
  actual: number;
  surprisePercent: number;
  timeOfDay: 'BMO' | 'AMC'; // Before Market Open / After Market Close
}

export enum AnalysisStage {
  STAGE_0 = 'Universe Gathering',
  STAGE_2 = 'Quality Filter',
  STAGE_3 = 'Fundamental Analysis',
  STAGE_4 = 'Technical Analysis',
  STAGE_5 = 'ICT Smart Money',
  STAGE_6 = 'AI Deep Analysis'
}
