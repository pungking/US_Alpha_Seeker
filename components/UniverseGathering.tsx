import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiProvider, ApiStatus } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { formatKstFilenameTimestamp } from '../services/timeService';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onAuthSuccess: (status: boolean) => void;
  isActive: boolean;
  apiStatuses: ApiStatus[];
  onStockSelected?: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

// [V13 ENGINE] Expanded Data Structure for Hedge Fund Grade Metrics (28 Fields)
interface MasterTicker {
  // 1. Basic Info & Price
  symbol: string;
  name: string;
  price: number;
  currency: string;
  marketCap: number;
  updated: string;
  source: string;
  
  // 2. Valuation (Value) - Multiples (x)
  pe: number;             // per
  pbr: number;            // pbr
  psr: number;            // psr
  pegRatio: number;       // pegRatio
  targetMeanPrice: number;// targetMeanPrice
  
  // 3. Quality & Efficiency (Quality) - Percentages (%)
  roe: number;            // roe
  roa: number;            // roa
  eps: number;            // eps (Currency)
  operatingMargins: number; // operatingMargins
  debtToEquity: number;   // debtToEquity (Ratio)
  // Distress model raw inputs (Altman / stability)
  totalAssets?: number;
  totalLiabilities?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  workingCapital?: number;
  retainedEarnings?: number;
  ebit?: number;
  totalRevenue?: number;
  
  // 4. Growth & Cash (Growth)
  revenueGrowth: number;  // revenueGrowth (%)
  operatingCashflow: number; // operatingCashflow (Currency)
  
  // 5. Dividend
  dividendRate: number;   // dividendRate (Currency)
  dividendYield: number;  // dividendYield (%)
  
  // 6. Momentum & Sentiment
  volume: number;
  beta: number;
  heldPercentInstitutions: number; // heldPercentInstitutions (%)
  shortRatio: number;     // shortRatio
  fiftyDayAverage: number;
  twoHundredDayAverage: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  
  // 7. Meta Data
  sector: string;
  industry: string;

  // System Fields
  change: number;
  changeAmount: number;
  prevClose: number;
  instrumentType: 'common' | 'warrant' | 'unit' | 'right' | 'hybrid' | 'unknown';
  analysisEligible: boolean;
  quoteSource?: string | null;
  netIncomeSource?: string | null;
  netIncomeAsOf?: string | null;
  changeSource?: 'QUOTE' | 'MISSING';
  changeStatus?: 'RECEIVED' | 'MISSING';
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Index Signature for dynamic expansion
  [key: string]: any;
}

interface EngineTelemetry {
  fps: number;
  latency: number;
  packetLoss: number;
  bufferSize: number;
  activeThreads: number;
}

// [HELPER] Smart Ratio Normalizer (Auto-Scaling)
// Handles mixed data sources (e.g., 0.15 vs 15.0)
const normalizePercent = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    let num = Number(val);
    if (isNaN(num)) return 0;
    
    // Heuristic: If value is small (e.g. < 5.0) and logically likely to be a decimal ratio (0.20 = 20%)
    // But allowing for negative growth (e.g. -0.5 = -50%)
    // Threshold: 5.0 (500%). Most ratios like ROE, Growth are rarely > 500% in decimal (5.0).
    // Exception: If source explicitly confirms unit, use that. Here we guess.
    if (Math.abs(num) <= 5.0 && num !== 0) {
        return parseFloat((num * 100).toFixed(2));
    }
    return parseFloat(num.toFixed(2));
};

const normalizeInstrumentType = (value: any): MasterTicker['instrumentType'] => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'common') return 'common';
    if (normalized === 'warrant') return 'warrant';
    if (normalized === 'unit') return 'unit';
    if (normalized === 'right') return 'right';
    if (normalized === 'hybrid') return 'hybrid';
    return 'unknown';
};

const classifyInstrumentType = (symbol: any, name: any, hintedType: any): MasterTicker['instrumentType'] => {
    const hinted = normalizeInstrumentType(hintedType);
    if (hinted !== 'unknown') return hinted;
    const s = String(symbol || '').trim().toUpperCase();
    const n = String(name || '').trim().toLowerCase();
    if (s.endsWith('.WS') || s.endsWith('-WS') || / warrant/.test(n)) return 'warrant';
    if (s.endsWith('.U') || s.endsWith('-U') || / unit/.test(n)) return 'unit';
    if (s.endsWith('.R') || s.endsWith('-R') || / right/.test(n)) return 'right';
    if (
        /preferred|depositary|capital security|baby bond|subordinat|trust preferred|notes/.test(n)
    ) return 'hybrid';
    return 'common';
};

const isAnalysisEligibleTicker = (item: any): boolean => {
    const instrumentType = normalizeInstrumentType(item?.instrumentType);
    const lifecycleState = String(item?.symbolLifecycleState || '').trim().toUpperCase();
    if (lifecycleState === 'RETIRED' || lifecycleState === 'EXCLUDED') return false;
    if (typeof item?.analysisEligible === 'boolean') return item.analysisEligible && instrumentType === 'common';
    return instrumentType === 'common';
};

interface NormalizedQuoteDeltaInput {
    price: number;
    prevCloseRaw: number;
    changeAmountRaw: number;
    changePercentRaw: number;
}

interface NormalizedQuoteDelta {
    prevClose: number;
    changeAmount: number;
    changePercent: number;
    changeStatus: 'RECEIVED' | 'MISSING';
    changeSource: 'QUOTE' | 'MISSING';
}

// Keep change% consistent with changeAmount/prevClose while preserving provider data when possible.
const normalizeQuoteDelta = ({
    price,
    prevCloseRaw,
    changeAmountRaw,
    changePercentRaw
}: NormalizedQuoteDeltaInput): NormalizedQuoteDelta => {
    const hasPrevClose = Number.isFinite(prevCloseRaw) && prevCloseRaw > 0;
    const hasPrice = Number.isFinite(price);
    const hasChangeAmount = Number.isFinite(changeAmountRaw);
    const hasChangePercent = Number.isFinite(changePercentRaw);

    const prevClose = hasPrevClose ? prevCloseRaw : 0;
    let changeAmount = hasChangeAmount
        ? changeAmountRaw
        : (hasPrevClose && hasPrice ? price - prevCloseRaw : 0);

    const derivedPct = hasPrevClose && Number.isFinite(changeAmount)
        ? (changeAmount / prevCloseRaw) * 100
        : null;

    let changePercent = 0;
    if (hasChangePercent) {
        // Some feeds send percent as -0.95, others as -0.0095. Pick the candidate
        // closest to the arithmetic identity (changeAmount / prevClose * 100).
        const direct = changePercentRaw;
        const scaled = changePercentRaw * 100;
        if (derivedPct !== null && Number.isFinite(derivedPct)) {
            const directErr = Math.abs(direct - derivedPct);
            const scaledErr = Math.abs(scaled - derivedPct);
            changePercent = scaledErr < directErr ? scaled : direct;
            if (Math.abs(changePercent - derivedPct) > 0.5) {
                changePercent = derivedPct;
            }
        } else {
            changePercent = direct;
        }
    } else if (derivedPct !== null && Number.isFinite(derivedPct)) {
        changePercent = derivedPct;
    }

    if (!Number.isFinite(changeAmount)) changeAmount = 0;
    if (!Number.isFinite(changePercent)) changePercent = 0;

    return {
        prevClose,
        changeAmount,
        changePercent,
        changeStatus: hasChangeAmount && hasChangePercent ? 'RECEIVED' : 'MISSING',
        changeSource: hasChangeAmount && hasChangePercent ? 'QUOTE' : 'MISSING'
    };
};

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  // --- CORE ENGINE STATE ---
  const [isGathering, setIsGathering] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Universe_Node v13.5.1: Drive-First Engine Restored.']);
  const [progress, setProgress] = useState({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Idle', phase: 'Idle', integrity: 100 });
  const [showConfig, setShowConfig] = useState(false);
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');

  // --- DATA & REGISTRY ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MasterTicker | null>(null);
  const [gatheredRegistry, setGatheredRegistry] = useState<Map<string, MasterTicker>>(new Map());
  
  // --- REAL-TIME FEED SYSTEM ---
  // [FIXED] Added setters for state to prevent runtime errors
  const [isLive, setIsLive] = useState(false);
  const [liveSource, setLiveSource] = useState<string>('');
  const [connectionHealth, setConnectionHealth] = useState<'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL'>('GOOD');
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [telemetry, setTelemetry] = useState<EngineTelemetry>({ fps: 60, latency: 0, packetLoss: 0, bufferSize: 0, activeThreads: 0 });
  
  // --- SYSTEM REFS ---
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const cleanupRef = useRef<() => void>(() => {}); 
  const prevPriceRef = useRef<number>(0);
  const healthCheckRef = useRef<any>(null);
  const searchDebounceRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  // --- SECURE KEYS ---
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;

  // --- UI EFFECTS ---

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Elapsed Time & Telemetry Simulation
  useEffect(() => {
    let interval: any;
    if (isGathering && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        setProgress(prev => ({ ...prev, elapsed }));
        
        setTelemetry(prev => ({
            ...prev,
            fps: Math.max(30, 60 - Math.random() * 10),
            latency: Math.floor(Math.random() * 50) + 10,
            activeThreads: Math.floor(Math.random() * 4) + 1
        }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGathering]);

  // Auto-Pilot
  useEffect(() => {
    if (autoStart && isActive && !isGathering) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging V13 Heavy Engine Ignition (Drive Only)...", "signal");
            startGathering(accessToken);
        } else {
            addLog("AUTO-PILOT: Critical - Auth Token Missing. Aborting.", "err");
        }
    }
  }, [autoStart, isActive, isGathering, accessToken]);

  // Search Logic (Local Registry -> External API if needed for search only)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    
    // Cleanup previous streams when query changes
    if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = () => {};
    }

    if (!searchQuery) {
        resetMonitorState();
        return;
    }

    const query = searchQuery.trim().toUpperCase();
    
    searchDebounceRef.current = setTimeout(async () => {
        // 1. Check Local Registry First (Instant Access)
        if (gatheredRegistry.has(query)) {
            const staticData = gatheredRegistry.get(query);
            if (staticData) {
                setSearchResult(staticData);
                prevPriceRef.current = staticData.price;
                addLog(`Registry Hit: ${staticData.symbol} loaded from local memory.`, "info");
                startRealTimeEngine(staticData.symbol);
                return;
            }
        }
        
        // 2. External API for Search only (if not found in local)
        setLiveSource('SEARCHING EXTERNAL...');
        try {
            const externalData = await fetchExternalStock(query);
            if (externalData) {
                setSearchResult(externalData);
                prevPriceRef.current = externalData.price;
                addLog(`External Hit: ${externalData.symbol} retrieved via Global Feed.`, "ok");
                
                // Add to temporary registry to avoid re-fetching
                setGatheredRegistry(prev => new Map(prev).set(externalData.symbol, externalData));
                
                startRealTimeEngine(externalData.symbol);
            } else {
                setSearchResult(null);
                setLiveSource('NOT FOUND');
                addLog(`Search failed for ${query} in all networks.`, "warn");
            }
        } catch (e) {
            setLiveSource('ERROR');
        }

    }, 500); // 500ms Debounce

    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery, gatheredRegistry]); 

  // --- HELPER METHODS ---

  const resetMonitorState = () => {
      setSearchResult(null);
      setIsLive(false);
      setPriceFlash(null);
      setLiveSource('');
      prevPriceRef.current = 0;
      setConnectionHealth('GOOD');
      setTelemetry({ fps: 60, latency: 0, packetLoss: 0, bufferSize: 0, activeThreads: 0 });
  };

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-60));
  };

  const handleSetTarget = () => {
      if (searchResult && onStockSelected) {
          onStockSelected(searchResult);
          addLog(`Target Locked: ${searchResult.symbol}. Handover to Deep Analysis.`, "ok");
      }
  };

  const handleAuth = () => {
      if (!gdriveClientId) {
          addLog("Missing Client ID. Open ⚙ Config.", "err");
          setShowConfig(true);
          return;
      }
      
      try {
          // @ts-ignore
          const client = google.accounts.oauth2.initTokenClient({
              client_id: gdriveClientId.trim(),
              scope: 'https://www.googleapis.com/auth/drive',
              callback: (tokenResponse: any) => {
                  if (tokenResponse.access_token) {
                      sessionStorage.setItem('gdrive_access_token', tokenResponse.access_token);
                      onAuthSuccess(true);
                      addLog("Cloud Vault Linked. Neural Link Established.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
          setShowConfig(true);
      }
  };

  // External API Fetcher (Yahoo) for SEARCH ONLY
  const fetchExternalStock = async (symbol: string): Promise<MasterTicker | null> => {
      try {
          const res = await fetch(`/api/yahoo?symbols=${symbol}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) return null;
          
          const raw = data[0];

          // [FIX] Fixed Mapping Helpers (Consistent with V13 Engine)
          const toPercent = (val: any) => {
              if (val === null || val === undefined || val === '') return 0;
              const num = Number(val);
              if (isNaN(num)) return 0;
              return parseFloat((num * 100).toFixed(2));
          };

          const keepRaw = (val: any) => {
              if (val === null || val === undefined || val === '') return 0;
              const num = Number(val);
              if (isNaN(num)) return 0;
              return parseFloat(num.toFixed(2));
          };

          const price = Number(raw.price ?? raw.regularMarketPrice ?? 0);
          const normalizedDelta = normalizeQuoteDelta({
              price,
              prevCloseRaw: Number(raw.prevClose ?? raw.regularMarketPreviousClose),
              changeAmountRaw: Number(raw.changeAmount ?? raw.regularMarketChange),
              changePercentRaw: Number(raw.change ?? raw.regularMarketChangePercent)
          });

          // Map to MasterTicker interface
          return {
              symbol: raw.symbol,
              name: raw.name || raw.shortName || raw.longName || "Unknown",
              price,
              change: parseFloat(normalizedDelta.changePercent.toFixed(2)),
              changeAmount: parseFloat(normalizedDelta.changeAmount.toFixed(2)),
              prevClose: parseFloat(normalizedDelta.prevClose.toFixed(2)),
              currency: raw.currency || 'USD',
              marketCap: raw.marketCap || 0,
              volume: raw.volume || raw.averageVolume || 0,
              
              pe: raw.trailingPE || 0,
              pbr: raw.priceToBook || 0,
              psr: raw.priceToSales || 0,
              pegRatio: raw.pegRatio || 0,
              targetMeanPrice: 0,
              
              // Normalize Ratios to Percentages (Fixed Mapping)
              roe: toPercent(raw.returnOnEquity),
              roa: toPercent(raw.returnOnAssets),
              eps: raw.eps || raw.trailingEps || 0,
              operatingMargins: toPercent(raw.operatingMargins),
              debtToEquity: keepRaw(raw.debtToEquity), // Debt is ratio, keep as is
              totalDebt: keepRaw(raw.totalDebt),
              longTermDebt: keepRaw(raw.longTermDebt),
              shortLongTermDebtTotal: keepRaw(raw.shortLongTermDebtTotal || raw.shortLongTermDebt),
              totalDebtAndCapitalLeaseObligation: keepRaw(raw.totalDebtAndCapitalLeaseObligation),
              totalEquity: keepRaw(raw.totalEquity || raw.stockholdersEquity || raw.totalStockholderEquity),
              totalStockholdersEquity: keepRaw(raw.totalStockholdersEquity || raw.totalStockholderEquity || raw.stockholdersEquity),
              // Distress model raw inputs (Altman / stability). Preserve source units as-is.
              totalAssets: keepRaw(raw.totalAssets),
              totalLiabilities: keepRaw(raw.totalLiabilities),
              currentAssets: keepRaw(raw.currentAssets),
              currentLiabilities: keepRaw(raw.currentLiabilities),
              workingCapital: keepRaw(raw.workingCapital),
              retainedEarnings: keepRaw(raw.retainedEarnings),
              ebit: keepRaw(raw.ebit),
              totalRevenue: keepRaw(raw.totalRevenue || raw.revenue),
              
              revenueGrowth: toPercent(raw.revenueGrowth),
              operatingCashflow: 0,
              dividendRate: raw.dividendRate || 0,
              dividendYield: keepRaw(raw.dividendYield), // Keep raw
              
              beta: raw.beta || 0,
              heldPercentInstitutions: toPercent(raw.heldPercentInstitutions),
              shortRatio: 0,
              fiftyDayAverage: raw.fiftyDayAverage || 0,
              twoHundredDayAverage: raw.twoHundredDayAverage || 0,
              fiftyTwoWeekHigh: raw.fiftyTwoWeekHigh || 0,
              fiftyTwoWeekLow: raw.fiftyTwoWeekLow || 0,
              
              sector: raw.sector || "Unknown",
              industry: raw.industry || "Unknown",
              
              updated: new Date().toISOString(),
              source: 'External_Yahoo',
              changeSource: normalizedDelta.changeSource,
              changeStatus: normalizedDelta.changeStatus,
              dataQuality: 'MEDIUM'
          };
      } catch (e) {
          return null;
      }
  };

  // --- V13 REAL-TIME ENGINE (WebSocket + Polling) ---
  const startRealTimeEngine = (symbol: string) => {
      let isCleanedUp = false;
      let heartbeatCount = 0;
      let activeSocket: WebSocket | null = null;
      let pollingInterval: number | null = null;
      
      // Reset State
      setConnectionHealth('GOOD');
      setIsLive(true);

      const pulseCheck = setInterval(() => {
          heartbeatCount++;
          if (heartbeatCount > 5) {
              setConnectionHealth('POOR');
          } else {
              setConnectionHealth('EXCELLENT');
          }
      }, 1000);
      healthCheckRef.current = pulseCheck;

      const updatePrice = (price: number, source: string, bid?: number, ask?: number) => {
          if (isCleanedUp) return;
          
          heartbeatCount = 0; // Reset heartbeat

          setSearchResult((prev: any) => {
              if (!prev || prev.symbol !== symbol) return prev;
              
              if (price !== prev.price) {
                  const direction = price > prev.price ? 'up' : 'down';
                  setPriceFlash(direction);
                  setTimeout(() => setPriceFlash(null), 300);
                  
                  let change = prev.change;
                  let changeAmount = prev.changeAmount;
                  if (prev.prevClose && prev.prevClose > 0) {
                      changeAmount = price - prev.prevClose;
                      change = (changeAmount / prev.prevClose) * 100;
                  }

                  return { 
                      ...prev, 
                      price, 
                      change, 
                      changeAmount,
                      bid: bid || prev.bid,
                      ask: ask || prev.ask
                  };
              }
              return prev; // No visual change, but confirms liveness
          });
          
          setLiveSource(source);
          prevPriceRef.current = price;
      };

      const connectPolling = () => {
          if (isCleanedUp) return;
          addLog(`Starting Polling Engine for ${symbol} (1000ms)...`, "info");
          
          const fetchPoll = async () => {
              if (isCleanedUp) return;
              try {
                  const res = await fetch(`/api/yahoo?symbols=${symbol}&t=${Date.now()}`);
                  if (res.ok) {
                      const data = await res.json();
                      if (data && data.length > 0) {
                          updatePrice(data[0].price, 'Yahoo (Realtime)');
                      }
                  }
              } catch(e) {
                  // Silent fail on individual poll
              }
          };

          fetchPoll(); // Immediate
          pollingInterval = window.setInterval(fetchPoll, 1000); // 1.0s Speed
      };

      const connectWS = () => {
          if (!finnhubKey) {
              addLog("No WebSocket Key. Falling back to Polling.", "warn");
              connectPolling();
              return;
          }

          try {
              const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
              activeSocket = ws;
              
              ws.onopen = () => {
                  if (isCleanedUp) { ws.close(); return; }
                  ws.send(JSON.stringify({ type: 'subscribe', symbol }));
                  addLog(`WS Stream: Connected to ${symbol}`, "info");
                  setLiveSource('Finnhub (Institutional)');
              };

              ws.onmessage = (event) => {
                  if (isCleanedUp) return;
                  try {
                      const msg = JSON.parse(event.data);
                      if (msg.type === 'trade' && msg.data && msg.data.length > 0) {
                          // Get latest trade
                          const trade = msg.data[msg.data.length - 1];
                          updatePrice(trade.p, 'Finnhub (Institutional)');
                          
                          setTelemetry(prev => ({
                              ...prev,
                              latency: Date.now() - trade.t < 1000 ? Date.now() - trade.t : 15,
                              packetLoss: 0
                          }));
                      }
                  } catch (e) {
                      setTelemetry(prev => ({ ...prev, packetLoss: prev.packetLoss + 1 }));
                  }
              };

              ws.onerror = (e) => {
                  console.error("WS Error", e);
                  if (!isCleanedUp) {
                      ws.close();
                      activeSocket = null;
                      connectPolling(); // Failover
                  }
              };
              
              ws.onclose = () => {
                   if (!isCleanedUp && !pollingInterval) {
                       console.warn("WS Closed. Failing over.");
                       connectPolling();
                   }
              };

          } catch (e) {
              connectPolling();
          }
      };

      // Start Protocol
      connectWS();

      // Return cleanup function for useEffect
      cleanupRef.current = () => {
          isCleanedUp = true;
          if (activeSocket) {
              activeSocket.close();
              activeSocket = null;
          }
          if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
          }
          if (healthCheckRef.current) {
              clearInterval(healthCheckRef.current);
              healthCheckRef.current = null;
          }
          setLiveSource('OFFLINE');
      };
  };

  // --- V13 ENGINE DATA PROCESSOR (DRIVE ONLY) ---

  const startGathering = async (token: string) => {
      setIsGathering(true);
      startTimeRef.current = Date.now();
      setProgress({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'V13_Engine', phase: 'Discovery', integrity: 100 });
      setGatheredRegistry(new Map()); 
      
      try {
          // STRICTLY USE DRIVE ONLY
          const assets = await mountFinancialEngine(token);
          
          if (assets.length === 0) throw new Error("Engine Stall: Zero assets loaded from Drive.");

          setProgress(prev => ({ ...prev, found: assets.length, phase: 'Mapping' }));
          addLog(`Engine Ignition Successful. ${assets.length} HP Generated from Drive.`, "ok");
          
          const invalidAssets = assets.filter(a => !a.price || a.price === 0).length;
          const integrityScore = Math.max(0, 100 - (invalidAssets / assets.length * 100));
          const eligibleUniverse = assets.filter(isAnalysisEligibleTicker);
          const monitoringUniverse = assets.filter((item) => !isAnalysisEligibleTicker(item));
          setProgress(prev => ({ ...prev, integrity: Math.floor(integrityScore) }));
          addLog(`Data Integrity: ${integrityScore.toFixed(1)}%. Valid Assets: ${assets.length - invalidAssets}`, integrityScore > 90 ? "ok" : "warn");
          addLog(
              `Eligibility Gate: input=${assets.length} eligible=${eligibleUniverse.length} excluded=${monitoringUniverse.length} (non-common)`,
              monitoringUniverse.length > 0 ? "warn" : "ok"
          );

          addLog(`Phase 2: Recording Telemetry to Stage 0...`, "info");
          setProgress(prev => ({ ...prev, phase: 'Commit' }));

          const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
          
          const timestamp = formatKstFilenameTimestamp();
          const fileName = `STAGE0_MASTER_UNIVERSE_${timestamp}.json`;
          
          const payload = {
              manifest: { 
                  version: "13.5.1", 
                  provider: "Drive_V13_Original_Files", 
                  date: new Date().toISOString(), 
                  count: assets.length,
                  inputCount: assets.length,
                  eligibleCount: eligibleUniverse.length,
                  excludedByInstrumentType: monitoringUniverse.length,
                  integrity: integrityScore,
                  note: "Smart Scaler Active: Revenue/ROE/Margins normalized to %. Loaded from Financial_Data_Daily."
              },
              universe: assets,
              eligible_universe: eligibleUniverse,
              monitoring_universe: monitoringUniverse
          };

          await uploadFile(token, folderId, fileName, payload);
          setProgress(prev => ({ ...prev, phase: 'Finalized' }));
          addLog(`System: Ready for Launch. Saved ${fileName}`, "ok");
          
          if (onComplete) onComplete();
      } catch (e: any) {
          addLog(`Fatal Error: ${e.message}`, "err");
          setProgress(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          setIsGathering(false);
          startTimeRef.current = 0;
      }
  };

  const mountFinancialEngine = async (token: string) => {
      addLog("Initializing V13 Engine Protocol...", "info");
      
      let systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      
      if (!systemMapFolderId) {
          addLog(`'${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not in Project Root. Scanning Drive Root...`, "warn");
          systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      }

      if (!systemMapFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not found in Drive.`);

      const financialDailyFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapFolderId);
      if (!financialDailyFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.financialDailyFolder}' not found inside Maps.`);

      addLog("Core Map Located. Firing Cylinders (A-Z)...", "ok");

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const cylinders = alphabet; 
      setProgress(prev => ({ ...prev, target: cylinders.length }));

      const masterUniverse: any[] = [];
      const tempRegistry = new Map<string, any>();

      for (let i = 0; i < cylinders.length; i++) {
          const char = cylinders[i];
          const fileName = `${char}_stocks_daily.json`;
          
          try {
              const fileId = await findFileId(token, fileName, financialDailyFolderId);
              
              if (fileId) {
                  const content = await downloadFile(token, fileId);
                  // [CORE] Process Data with Robust Key Mapping & Scaling
                  const stocks = processCylinderData(content);
                  const count = stocks.length;
                  
                  masterUniverse.push(...stocks);
                  stocks.forEach(s => tempRegistry.set(s.symbol, s));
                  setGatheredRegistry(new Map(tempRegistry));

                  addLog(`Cylinder ${char}: Fired. ${count} HP added.`, "info");
                  setProgress(prev => ({ ...prev, found: masterUniverse.length, synced: i + 1 }));
              } else {
                  addLog(`Cylinder ${char} Misfire: ${fileName} not found.`, "warn");
              }
          } catch (e: any) {
              addLog(`Cylinder ${char} Failure: ${e.message}`, "err");
          }
          await new Promise(r => setTimeout(r, 20));
      }
      
      return masterUniverse;
  };

  // [V13] Enhanced Data Processor for 28 Metrics
  // [FIX] Smart Scaling for Ratios
  const processCylinderData = (jsonContent: any): MasterTicker[] => {
      const results: MasterTicker[] = [];
      try {
          const items = Array.isArray(jsonContent) ? jsonContent : Object.values(jsonContent);
          
          return items.map((item: any) => {
              const root = item.basic || item;
              if (!root.symbol) return null;

              const price = Number(root.price) || 0;
              const instrumentType = classifyInstrumentType(root.symbol, root.name || root.companyName, root.instrumentType);
              const analysisEligible = typeof root.analysisEligible === 'boolean'
                  ? root.analysisEligible && instrumentType === 'common'
                  : instrumentType === 'common';

              const normalizedDelta = normalizeQuoteDelta({
                  price,
                  prevCloseRaw: Number(root.regularMarketPreviousClose ?? root.previousClose ?? root.prevClose),
                  changeAmountRaw: Number(root.regularMarketChange ?? root.changeAmount),
                  changePercentRaw: Number(root.regularMarketChangePercent ?? root.change)
              });

              // [FIX] Fixed Mapping Helpers
              const toPercent = (val: any) => {
                  if (val === null || val === undefined || val === '') return 0;
                  const num = Number(val);
                  if (isNaN(num)) return 0;
                  return parseFloat((num * 100).toFixed(2));
              };

              const keepRaw = (val: any) => {
                  if (val === null || val === undefined || val === '') return 0;
                  const num = Number(val);
                  if (isNaN(num)) return 0;
                  return parseFloat(num.toFixed(2));
              };

              // [FIX] PEG Ratio Calculation
              // Revenue growth can arrive as either a ratio (0.12 => 12%) or a percent (12 => 12%).
              // Normalize to percent before fallback PEG calculation to avoid scale drift.
              const per = Number(root.per || root.pe || root.peRatio || 0);
              const revGrowthRaw = Number(root.revenueGrowth || 0);
              let pegRatio = Number(root.pegRatio || root.peg || 0);

              const normalizeGrowthPctForPeg = (rawGrowth: number): number => {
                  if (!Number.isFinite(rawGrowth) || rawGrowth === 0) return 0;
                  const absGrowth = Math.abs(rawGrowth);

                  // Common ratio-form feed from Yahoo/FMP style payloads.
                  if (absGrowth <= 1.5) return rawGrowth * 100;
                  // Clearly percent-form values.
                  if (absGrowth >= 5) return rawGrowth;

                  // Ambiguous zone (1.5~5): choose the interpretation that yields a sane PEG.
                  const asDecimalPct = rawGrowth * 100;
                  const asPercent = rawGrowth;
                  if (per <= 0) return asDecimalPct;

                  const pegFromDecimal = per / asDecimalPct;
                  const pegFromPercent = per / asPercent;
                  const isSanePeg = (peg: number) => Number.isFinite(peg) && peg > 0 && peg <= 25;

                  if (isSanePeg(pegFromDecimal) && !isSanePeg(pegFromPercent)) return asDecimalPct;
                  if (!isSanePeg(pegFromDecimal) && isSanePeg(pegFromPercent)) return asPercent;

                  // Default to ratio interpretation to preserve current harvester contract.
                  return asDecimalPct;
              };

              const growthPctForPeg = normalizeGrowthPctForPeg(revGrowthRaw);
              if (pegRatio === 0 && per > 0 && growthPctForPeg > 0) {
                  pegRatio = per / growthPctForPeg;
              }

              return {
                  // 1. Basic Info & Price
                  symbol: root.symbol,
                  name: root.name || root.companyName || "Unknown",
                  price: price,
                  currency: root.currency || "USD",
                  marketCap: Number(root.marketCap) || 0,
                  updated: new Date().toISOString(),
                  source: 'V13_Cylinder',

                  // 2. Valuation (Value) - Keep as Multiples (x)
                  pe: per, 
                  pbr: Number(root.pbr || root.priceToBook || root.priceToBookRatio || 0),
                  psr: Number(root.psr || root.priceToSales || root.priceToSalesRatio || 0),
                  pegRatio: parseFloat(pegRatio.toFixed(2)),
                  targetMeanPrice: Number(root.targetMeanPrice || 0),

                  // 3. Profitability & Efficiency (Quality) - FIXED MAPPING
                  roe: toPercent(root.roe || root.returnOnEquity),
                  roa: toPercent(root.roa || root.returnOnAssets),
                  eps: Number(root.eps || root.earningsPerShare || 0),
                  operatingMargins: toPercent(root.operatingMargins || root.operatingMargin),
                  debtToEquity: keepRaw(root.debtToEquity || root.debtEquityRatio), // Keep raw
                  totalDebt: Number(root.totalDebt || 0),
                  longTermDebt: Number(root.longTermDebt || 0),
                  shortLongTermDebtTotal: Number(root.shortLongTermDebtTotal || root.shortLongTermDebt || 0),
                  totalDebtAndCapitalLeaseObligation: Number(root.totalDebtAndCapitalLeaseObligation || 0),
                  totalEquity: Number(root.totalEquity || root.stockholdersEquity || root.totalStockholderEquity || 0),
                  totalStockholdersEquity: Number(root.totalStockholdersEquity || root.totalStockholderEquity || root.stockholdersEquity || 0),
                  // Distress model raw inputs (Altman / stability). Keep numeric scale from harvester.
                  totalAssets: Number(root.totalAssets || 0),
                  totalLiabilities: Number(root.totalLiabilities || 0),
                  currentAssets: Number(root.currentAssets || 0),
                  currentLiabilities: Number(root.currentLiabilities || 0),
                  workingCapital: Number(root.workingCapital || 0),
                  retainedEarnings: Number(root.retainedEarnings || 0),
                  ebit: Number(root.ebit || 0),
                  totalRevenue: Number(root.totalRevenue || root.revenue || 0),

                  // 4. Growth & Cash
                  revenueGrowth: toPercent(root.revenueGrowth),
                  operatingCashflow: Number(root.operatingCashflow || root.operatingCashFlow || 0),
                  netIncome: Number(root.netIncome || 0),
                  netIncomeCommonStockholders: Number(root.netIncomeCommonStockholders || root.netIncome || 0),

                  // 5. Dividend
                  dividendRate: Number(root.dividendRate || 0),
                  dividendYield: keepRaw(root.dividendYield), // Keep raw

                  // 6. Momentum & Sentiment
                  volume: Number(root.volume) || 0,
                  beta: Number(root.beta || 0),
                  heldPercentInstitutions: toPercent(root.heldPercentInstitutions || root.institutionOwnership),
                  shortRatio: Number(root.shortRatio || 0),
                  fiftyDayAverage: Number(root.fiftyDayAverage || 0),
                  twoHundredDayAverage: Number(root.twoHundredDayAverage || 0),
                  fiftyTwoWeekHigh: Number(root.fiftyTwoWeekHigh || root.yearHigh || 0),
                  fiftyTwoWeekLow: Number(root.fiftyTwoWeekLow || root.yearLow || 0),

                  // 7. Meta Data
                  sector: root.sector || 'Unknown',
                  industry: root.industry || 'Unknown',

                  // System Fields
                  change: parseFloat(normalizedDelta.changePercent.toFixed(2)),
                  changeAmount: parseFloat(normalizedDelta.changeAmount.toFixed(2)),
                  prevClose: parseFloat(normalizedDelta.prevClose.toFixed(2)),
                  instrumentType,
                  analysisEligible,
                  changeSource: normalizedDelta.changeSource,
                  changeStatus: normalizedDelta.changeStatus,
                  quoteTimestamp: Number(root.quoteTimestamp || 0),
                  quoteSource: root.quoteSource || null,
                  netIncomeSource: root.netIncomeSource || null,
                  netIncomeAsOf: root.netIncomeAsOf || null,
                  dataQuality: (price > 0 ? 'HIGH' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW'
              };
          }).filter(item => item !== null) as MasterTicker[];
      } catch (e) {
          console.error("Error processing cylinder data chunk", e);
      }
      return results;
  };

  // --- DRIVE UTILS ---
  const assertDriveOk = async (res: Response, context: string) => {
      if (res.ok) return;
      const errText = await res.text().catch(() => '');
      throw new Error(`Drive ${context} failed: HTTP ${res.status} ${errText.slice(0, 240)}`);
  };

  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      await assertDriveOk(res, `findFolder(${name})`);
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      await assertDriveOk(res, `findFileId(${name})`);
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      await assertDriveOk(res, `downloadFile(${fileId})`);
      
      // [FIX] Handle non-standard JSON (NaN, Infinity) from Python/Pandas dumps
      const text = await res.text();
      const safeText = text
        .replace(/:\s*NaN/g, ': null')
        .replace(/:\s*Infinity/g, ': null')
        .replace(/:\s*-Infinity/g, ': null');
        
      return JSON.parse(safeText);
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(listRes, `ensureFolder.list(${name})`);
      const listed = await listRes.json();
      if (listed.files?.length > 0) return listed.files[0].id;

      const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      });
      await assertDriveOk(createRes, `ensureFolder.create(${name})`);
      const created = await createRes.json();
      if (!created?.id) throw new Error(`Drive ensureFolder.create(${name}) succeeded but missing folder id`);
      return created.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      
      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
      });
      if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => '');
          throw new Error(`Drive upload failed (${name}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }
      const uploaded = await uploadRes.json().catch(() => null);
      if (!uploaded?.id) {
          addLog(`[WARN] Drive upload 응답에 fileId 누락 (${name})`, "warn");
          return;
      }
      addLog(`[OK] Drive upload verified: ${name} (${uploaded.id})`, "ok");
  };

  const formatMarketCap = (num: number) => {
    if (!num) return 'N/A';
    if (num >= 1.0e+12) return `$${(num / 1.0e+12).toFixed(2)}T`;
    if (num >= 1.0e+9) return `$${(num / 1.0e+9).toFixed(2)}B`;
    if (num >= 1.0e+6) return `$${(num / 1.0e+6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  // --- DYNAMIC STYLING ---
  const getBorderColor = () => {
    if (priceFlash === 'up') return '#4ade80'; 
    if (priceFlash === 'down') return '#f87171'; 

    if (searchResult && isLive) {
        // [FIX] Neutral state for 0% change
        if (Math.abs(searchResult.change) < 0.01) return 'rgba(255,255,255,0.05)';
        return searchResult.change > 0 
            ? 'rgba(16, 185, 129, 0.5)' 
            : 'rgba(244, 63, 94, 0.5)'; 
    }
    
    return 'rgba(255,255,255,0.05)'; 
  };

  const getBackgroundColor = () => {
    if (priceFlash === 'up') return 'rgba(74, 222, 128, 0.15)'; 
    if (priceFlash === 'down') return 'rgba(248, 113, 113, 0.15)';

    if (searchResult && isLive) {
        // [FIX] Neutral state for 0% change
        if (Math.abs(searchResult.change) < 0.01) return 'transparent';
        return searchResult.change > 0 
            ? 'rgba(16, 185, 129, 0.05)' 
            : 'rgba(244, 63, 94, 0.05)';
    }

    return 'transparent'; 
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Config Modal */}
        {showConfig && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <div className="glass-panel p-8 rounded-[40px] max-w-md w-full border-t-2 border-t-blue-500 shadow-2xl space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black text-white italic tracking-tight uppercase">Infrastructure Config</h3>
                        <button onClick={() => setShowConfig(false)} className="text-slate-500 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Google Cloud Client ID</label>
                        <input 
                            type="text" 
                            value={gdriveClientId} 
                            onChange={(e) => setGdriveClientId(e.target.value)} 
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none" 
                            placeholder="Enter GDrive Client ID" 
                        />
                        <p className="text-[9px] text-slate-600 font-medium">Project ID: 741017429020</p>
                    </div>
                    <button onClick={() => { localStorage.setItem('gdrive_client_id', gdriveClientId); setShowConfig(false); addLog("Infrastructure Persisted Successfully.", "ok"); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all">Apply Changes</button>
                </div>
            </div>
        )}

      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isGathering ? 'animate-pulse' : ''}`}>
                 <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isGathering ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v13.5</h2>
                <div className="flex items-center mt-2 space-x-2">
                   <span className="text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest bg-indigo-500/20 text-indigo-400 border-indigo-500/20">V13_Drive_Only</span>
                   <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            
            <button 
                onClick={accessToken ? () => startGathering(accessToken) : handleAuth} 
                disabled={isGathering}
                className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isGathering ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : accessToken ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'}`}
            >
                {isGathering ? 'Cylinders Firing...' : accessToken ? 'Ignite V13 Engine' : 'Connect Cloud Vault'}
            </button>
          </div>

          <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
             <div className="flex items-center justify-between mb-4">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
                 <div className="flex items-center gap-2">
                     <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${connectionHealth === 'EXCELLENT' ? 'text-emerald-400 border-emerald-500/30' : connectionHealth === 'GOOD' ? 'text-blue-400 border-blue-500/30' : 'text-red-400 border-red-500/30'}`}>
                         {connectionHealth} SIGNAL
                     </span>
                     {isLive && <span className="text-[8px] font-black text-emerald-400 animate-pulse uppercase border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">● {liveSource || 'LIVE FEED'}</span>}
                 </div>
             </div>
             <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <input 
                        type="text" 
                        placeholder="Verify Ticker (e.g. AAPL, DIS)" 
                        className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    
                    {/* ENHANCED TICKER BOX: 8 Core Quant Metrics */}
                    <div 
                        className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all duration-300 transform ${priceFlash ? 'scale-105' : 'scale-100'} ${searchResult ? '' : 'bg-slate-900 border-white/5'}`}
                        style={searchResult ? {
                            borderWidth: '2px', 
                            borderColor: getBorderColor(),
                            backgroundColor: getBackgroundColor()
                        } : {}}
                    >
                        {searchResult ? (
                            <div className="w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <p className="text-xl font-black text-white">{searchResult.symbol}</p>
                                        <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{searchResult.name}</p>
                                    </div>
                                    <div className="text-right">
                                        {isLive ? (
                                            <>
                                                {/* Price text stays white unless flashing */}
                                                <p className={`text-2xl font-mono font-black transition-all duration-300 ${priceFlash === 'up' ? 'text-emerald-300 scale-110' : priceFlash === 'down' ? 'text-rose-300 scale-110' : 'text-white'}`}>
                                                    ${searchResult.price?.toFixed(2) || 'N/A'}
                                                </p>
                                                <p className={`text-[10px] font-bold flex items-center justify-end gap-1 ${Math.abs(searchResult.change) < 0.01 ? 'text-slate-400' : searchResult.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    <span>{Math.abs(searchResult.change) < 0.01 ? '-' : searchResult.change > 0 ? '▲' : '▼'} {Math.abs(searchResult.changeAmount || 0).toFixed(2)}</span>
                                                    <span className="opacity-50">({Math.abs(searchResult.change || 0).toFixed(2)}%)</span>
                                                </p>
                                            </>
                                        ) : (
                                            <div className="text-right">
                                                <p className="text-2xl font-mono font-black text-white">${searchResult.price?.toFixed(2)}</p>
                                                <p className={`text-[10px] font-bold ${Math.abs(searchResult.change) < 0.01 ? 'text-slate-400' : searchResult.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                     {Math.abs(searchResult.change) < 0.01 ? '-' : searchResult.change > 0 ? '▲' : '▼'} {Math.abs(searchResult.change || 0).toFixed(2)}%
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-3 bg-black/40 p-4 rounded-xl border border-white/5 mb-4">
                                    {/* Slot 1: Market Cap (Size) */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Market Cap</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{formatMarketCap(searchResult.marketCap)}</span>
                                    </div>
                                    {/* Slot 2: P/E (Valuation) */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">P/E (TTM)</span>
                                        <span className={`text-xs font-mono font-bold ${searchResult.pe > 30 ? 'text-rose-400' : 'text-emerald-400'}`}>{searchResult.pe ? searchResult.pe.toFixed(1) + 'x' : 'N/A'}</span>
                                    </div>
                                    {/* Slot 3: P/S (Revenue Multi) */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">P/S (TTM)</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.psr ? searchResult.psr.toFixed(1) + 'x' : 'N/A'}</span>
                                    </div>
                                    {/* Slot 4: ROE (Quality) - Normalized % */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">ROE</span>
                                        <span className={`text-xs font-mono font-bold ${searchResult.roe > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{searchResult.roe ? searchResult.roe.toFixed(1) + '%' : 'N/A'}</span>
                                    </div>
                                    
                                    {/* Slot 5: Operating Margin (Efficiency) - Normalized % */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Op. Margin</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.operatingMargins ? (searchResult.operatingMargins).toFixed(1) + '%' : 'N/A'}</span>
                                    </div>
                                    {/* Slot 6: Inst. Own (Smart Money) - Hedge Fund Special - Normalized % */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Inst. Own</span>
                                        <span className={`text-xs font-mono font-bold ${searchResult.heldPercentInstitutions > 70 ? 'text-indigo-400' : 'text-slate-300'}`}>
                                            {searchResult.heldPercentInstitutions ? (searchResult.heldPercentInstitutions).toFixed(1) + '%' : 'N/A'}
                                        </span>
                                    </div>
                                    {/* Slot 7: Beta (Volatility) */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Beta</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.beta ? searchResult.beta.toFixed(2) : 'N/A'}</span>
                                    </div>
                                    {/* Slot 8: Target Gap (Upside) */}
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Target Gap</span>
                                        <span className={`text-xs font-mono font-bold ${searchResult.targetMeanPrice > searchResult.price ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {searchResult.targetMeanPrice > 0 ? (((searchResult.targetMeanPrice - searchResult.price) / searchResult.price) * 100).toFixed(1) + '%' : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                     <button 
                                        onClick={handleSetTarget}
                                        className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg"
                                    >
                                        Set Audit Target
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black italic uppercase tracking-widest text-slate-600">{searchQuery ? 'Searching Registry...' : 'Awaiting Input...'}</span>
                        )}
                    </div>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
               {[
                 { label: 'Cylinders (Files)', val: `${progress.synced}/26`, color: 'text-white' },
                 { label: 'Horsepower (Assets)', val: progress.found.toLocaleString(), color: 'text-indigo-400' },
                 { label: 'Cycle Time', val: `${progress.elapsed}s`, color: 'text-slate-400' },
                 { label: 'Engine Status', val: progress.phase, color: 'text-blue-400' }
               ].map((item, idx) => (
                   <div key={idx} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                       <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{item.label}</p>
                       <p className={`text-lg md:text-xl font-mono font-black italic ${item.color} truncate`}>{item.val}</p>
                   </div>
               ))}
          </div>

          <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
              <div 
                className="h-full rounded-xl transition-all duration-700 bg-gradient-to-r from-blue-700 to-indigo-500" 
                style={{ width: `${Math.min(100, (progress.synced / progress.target) * 100)}%` }}
              ></div>
          </div>

        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Engine_Telemetry</h3>
             <div className="flex items-center gap-2">
                 <span className="text-[8px] font-mono text-slate-500">FPS: {telemetry.fps.toFixed(0)}</span>
                 <span className="text-[8px] font-mono text-slate-500">LAT: {telemetry.latency}ms</span>
             </div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
