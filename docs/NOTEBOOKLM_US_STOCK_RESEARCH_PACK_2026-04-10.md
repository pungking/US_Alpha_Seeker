# NotebookLM US Stock Research Pack (2026-04-10)

## 목적
- 최근 미국 주식시장 분석에 필요한 핵심 거시/수급/실적 데이터를 한 번에 묶어 NotebookLM에 투입하기 위한 소스 팩.
- 자동화 시스템(분석 -> 추천 -> 시뮬 -> 자동매매/긴급대응)에 바로 연결 가능한 질문 템플릿 포함.

## 기준 시점
- 작성일: 2026-04-10 (KST)
- 데이터는 각 원문 공개 시점 기준 (문서별 날짜 표기 참고)

## 핵심 요약

### 1) 통화정책 (Fed)
- 2026-03-18 FOMC: 기준금리 목표범위 3.50%~3.75% 유지.
- IORB 3.65% 유지.
- 해석: 금리 경로는 데이터 의존적이며, 변동성 이벤트(물가/고용) 발표일 전후로 정책 기대 변동 가능.

### 2) 고용 (BLS)
- 2026-03 고용보고서(2026-04-03 발표):
  - 비농업 고용 +178k
  - 실업률 4.3%
- 해석: 노동시장은 급랭보다는 완만 둔화 구간으로 해석 가능.

### 3) 물가 (BLS CPI)
- 최신 확정(현재 조회 가능한 최신): 2026-02 CPI
  - MoM +0.3%
  - YoY +2.4%
  - Core YoY +2.5%
- 2026-03 CPI는 2026-04-10 08:30 ET 공개 일정.
- 해석: 물가 경로가 금리 기대 및 성장주/가치주 상대강도에 직접 영향.

### 4) 성장 Nowcast (Atlanta Fed GDPNow)
- 2026-04-02 업데이트: 2026Q1 GDPNow 1.6% (SAAR)
- 해석: 성장 모멘텀은 플러스이나 강한 재가속 국면으로 보긴 이른 레벨.

### 5) 변동성 (Cboe VIX)
- Cboe VIX 페이지 기준(2026-04-02 표기): Spot 약 23.87
- 해석: 리스크온/리스크오프 경계대 인근으로, 신호 품질/손절 정책 엄격 운용 필요.

### 6) 실적 시즌 (FactSet)
- Q1 2026 프리뷰(2026-04-02):
  - S&P 500 Q1 총 이익 추정치가 분기초 대비 +0.4% 상향
  - EPS 가이던스: 긍정 59 vs 부정 51
  - 상향은 IT, Energy에 집중
  - Forward P/E 19.8 (5Y 평균 19.9, 10Y 평균 18.9)
- 해석: 지수 전체보다 섹터/팩터 분화 대응이 중요.

### 7) 거래시간/이벤트 (NYSE)
- 코어 거래: 09:30~16:00 ET
- 2026 휴장/조기종료 캘린더 확인 가능.
- 해석: 자동실행 스케줄은 RTH 기준 + 이벤트 발표 시간대 연동이 필수.

## NotebookLM 투입용 소스 링크
- Fed FOMC Statement (2026-03-18): https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a.htm
- Fed Implementation Note (2026-03-18): https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a1.htm
- BLS Employment Situation (2026-03): https://www.bls.gov/news.release/archives/empsit_04032026.htm
- BLS CPI (2026-02): https://www.bls.gov/news.release/archives/cpi_03112026.htm
- BLS CPI release schedule: https://www.bls.gov/schedule/news_release/cpi.htm
- Atlanta Fed GDPNow: https://www.atlantafed.org/research-and-data/data/gdpnow
- GDPNow commentaries: https://www.atlantafed.org/research-and-data/data/gdpnow/current-and-past-gdpnow-commentaries
- Cboe VIX: https://www.cboe.com/tradable-products/vix/
- FactSet Q1 2026 earnings preview: https://insight.factset.com/sp-500-earnings-season-preview-q1-2026
- NYSE Holidays/Trading Hours: https://www.nyse.com/markets/hours-calendars
- CME FedWatch main: https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html

## 카테고리별 고신뢰 링크 (추가)

### 1) 금융/경제 (공식 1차 소스)
- Federal Reserve calendar: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- BLS Economic Releases calendar: https://www.bls.gov/schedule/news_release/
- BEA News Releases: https://www.bea.gov/news
- US Treasury Yield Curve rates: https://home.treasury.gov/resource-center/data-chart-center/interest-rates
- FRED (St. Louis Fed): https://fred.stlouisfed.org/

### 2) 변동성/파생/수급
- Cboe VIX products: https://www.cboe.com/tradable-products/vix/
- CFTC Commitments of Traders (COT): https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm
- CME FedWatch: https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html

### 3) 실적/기업 펀더멘털/공시
- SEC EDGAR company filings: https://www.sec.gov/edgar/searchedgar/companysearch
- SEC press releases: https://www.sec.gov/news/pressreleases
- S&P DJI index dashboard: https://www.spglobal.com/spdji/en/

### 4) 테마/트렌드/섹터
- GICS sectors overview (S&P): https://www.spglobal.com/spdji/en/landing/topic/gics/
- NYSE market data overview: https://www.nyse.com/market-data
- Nasdaq market activity: https://www.nasdaq.com/market-activity

### 5) 분석기법/신호검색/모델 품질
- Ken French Data Library (factor research): https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
- NBER Working Papers search: https://www.nber.org/papers
- BIS research hub: https://www.bis.org/publ/research.htm

### 6) 차트/OHLCV 데이터 파이프라인 검증
- Alpha Vantage docs (OHLCV/indicators): https://www.alphavantage.co/documentation/
- Alpaca market data docs: https://docs.alpaca.markets/docs/market-data
- Polygon market data docs: https://polygon.io/docs
- Nasdaq historical quote data: https://www.nasdaq.com/market-activity/quotes/historical

## NotebookLM 투입 우선순위 (권장)
- P0 (매일): Fed/BLS/BEA/Cboe/CME/FRED/SEC
- P1 (주간): COT/GICS/S&P sector pages
- P2 (개선 실험): Ken French/NBER/BIS + OHLCV provider docs

## 차트 패턴/신호 분석 링크 (추가)
- NBER, Foundations of Technical Analysis (Lo et al.): https://www.nber.org/papers/w7613
- CMT Association (Body of Knowledge): https://cmtassociation.org/body-of-knowledge/
- TA-Lib pattern recognition functions: https://ta-lib.github.io/ta-lib-python/func_groups/pattern_recognition.html
- StockCharts ChartSchool (pattern taxonomy): https://chartschool.stockcharts.com/
- TradingView Pine Script docs (pattern/signal implementation): https://www.tradingview.com/pine-script-docs/welcome/
- pandas-ta indicators list (OHLCV signal engineering): https://xgboosted.github.io/pandas-ta-classic/indicators.html

## 차트 패턴 질문 템플릿 (NotebookLM)
- "NBER/TA-Lib/CMT 기준으로 신뢰도 높은 패턴 10개를 강세/약세/중립으로 분류하고 false signal 조건을 적어줘."
- "OHLCV만으로 구현 가능한 breakout/reversal/continuation 신호를 수식(또는 의사코드)으로 정리해줘."
- "자동매매용으로 패턴+거래량+변동성 결합 점수(0~100) 모델을 설계하고 백테스트 체크리스트를 제시해줘."

## 운영 메모
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BOOTSTRAP_URLS`는 "노트북 URL 등록" 용도다.
- 위 링크들은 NotebookLM 노트북 내부의 "소스 추가"로 넣어야 실제 질문 응답 품질이 올라간다.

## NotebookLM 질문 템플릿 (바로 복붙)

### A. 거시-시장 연결
- "위 소스 기준으로 2026-04-10 현재 미국 주식시장 핵심 드라이버를 1) 금리 2) 물가 3) 고용 4) 실적 5) 변동성으로 5줄 요약해줘."
- "FOMC/BLS/GDPNow 조합으로 성장주-가치주-방어주 상대 우위 시나리오 3개를 확률과 함께 제시해줘."

### B. 섹터 로테이션
- "FactSet 실적 가이던스와 거시지표를 같이 반영해 향후 2~6주 섹터 상대강도(Overweight/Neutral/Underweight) 제안해줘."
- "IT/Energy 상향 집중이 인덱스 왜곡인지 구조적 추세인지 판단 근거를 표로 만들어줘."

### C. 자동매매 정책 연결
- "VIX 레벨, 고용/물가 이벤트 일정을 반영한 Entry/Stop/Size 정책을 보수/중립/공격 3세트로 만들어줘."
- "시장 개장 전/개장 후/이벤트 직후에 각각 어떤 자동화 가드(진입 차단, 비중 축소, 손절 강화)를 써야 하는지 규칙으로 정리해줘."

### D. 검증/리스크
- "추천 규칙이 과최적화인지 확인할 체크리스트(데이터 누수, 룩어헤드, 샘플편향, 체리피킹)를 만들어줘."
- "실거래 전 shadow-only 검증에 필요한 최소 증거 항목을 정의해줘."

## 자동화 시스템 반영 포인트
- 레짐 입력: Fed/BLS/GDPNow/VIX 이벤트를 sidecar regime/guard 파라미터로 사전 반영.
- 스케줄: CPI/고용/FOMC 발표 시각(ET)을 cron + preflight 정책과 동기화.
- 실적 시즌: 섹터 편중(IT/Energy) 시 포트폴리오 concentration guard 강화.
- 승격 게이트: payload-path 검증 + shadow drift 안정 + marker audit 통과 시에만 실전 승격.
