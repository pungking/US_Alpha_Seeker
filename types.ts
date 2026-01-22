
export enum ApiProvider {
  ALPACA = 'Alpaca',
  PERPLEXITY = 'Perplexity',
  ALPHA_VANTAGE = 'Alpha Vantage',
  FINNHUB = 'Finnhub',
  TWELVE_DATA = 'Twelve Data',
  POLYGON = 'Polygon',
  GOOGLE_DRIVE = 'Google Drive',
  GEMINI = 'Google Gemini',
  CHATGPT = 'OpenAI ChatGPT'
}

export interface ApiStatus {
  provider: ApiProvider;
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

export enum AnalysisStage {
  STAGE_0 = 'Universe Gathering',
  STAGE_2 = 'Quality Filter',
  STAGE_3 = 'Fundamental Analysis',
  STAGE_4 = 'Technical Analysis',
  STAGE_5 = 'ICT Smart Money',
  STAGE_6 = 'AI Deep Analysis'
}
