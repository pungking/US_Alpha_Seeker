# NotebookLM Source Upload Batch (US Market, 2026-04-10)

## 목적
- NotebookLM 노트북(`NotebookLM -> Obsidian`)에 바로 넣을 1차 고신뢰 소스 배치.
- 자동매매 품질(승률/정확도/리스크 대응) 향상을 위한 거시/변동성/섹터/차트/OHLCV 검증 자료 중심.

## 업로드 우선순위
- P0: 매일 갱신 감시(공식 지표/정책/변동성)
- P1: 주간 갱신 감시(섹터/실적/수급)
- P2: 방법론/연구(차트 패턴, 신호 정의, 백테스트 품질)

---

## P0 (필수) 공식 1차 소스
- https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- https://www.federalreserve.gov/newsevents/pressreleases.htm
- https://www.bls.gov/schedule/news_release/
- https://www.bls.gov/news.release/cpi.htm
- https://www.bls.gov/news.release/empsit.htm
- https://www.bea.gov/news
- https://home.treasury.gov/resource-center/data-chart-center/interest-rates
- https://fred.stlouisfed.org/
- https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html
- https://www.cboe.com/tradable-products/vix/
- https://www.nyse.com/markets/hours-calendars
- https://www.sec.gov/edgar/searchedgar/companysearch

## P1 (권장) 섹터/수급/시장 구조
- https://www.spglobal.com/spdji/en/landing/topic/gics/
- https://www.spglobal.com/spdji/en/
- https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm
- https://www.nasdaq.com/market-activity
- https://www.nasdaq.com/market-activity/quotes/historical
- https://insight.factset.com/sp-500-earnings-season-preview-q1-2026
- https://www.atlantafed.org/research-and-data/data/gdpnow
- https://www.atlantafed.org/research-and-data/data/gdpnow/current-and-past-gdpnow-commentaries

## P2 (개선 실험) 차트 패턴/신호/백테스트
- https://www.nber.org/papers/w7613
- https://cmtassociation.org/body-of-knowledge/
- https://chartschool.stockcharts.com/
- https://ta-lib.github.io/ta-lib-python/func_groups/pattern_recognition.html
- https://www.tradingview.com/pine-script-docs/welcome/
- https://xgboosted.github.io/pandas-ta-classic/indicators.html
- https://www.alphavantage.co/documentation/
- https://docs.alpaca.markets/docs/market-data
- https://polygon.io/docs
- https://www.bis.org/publ/research.htm

---

## 업로드 팁 (NotebookLM)
- 1) P0부터 먼저 넣고 질문 테스트 -> 2) P1/P2 순으로 확장.
- 출처가 0개면 질문창이 비활성(`시작하려면 출처를 업로드하세요.`)이므로, 최소 P0 5개 이상 먼저 업로드.
- 중복/낡은 링크는 제거하고, 월 1회 링크 상태 점검.

## 권장 질의 5개
- "이번 주 미국 주식시장 핵심 리스크/촉매를 거시-변동성-실적으로 요약하고 출처 인용해줘."
- "Fed/BLS/CME/Cboe 기준으로 risk-on/risk-off 게이트 규칙을 숫자로 제안해줘."
- "OHLCV 기반 false-positive 감소용 엔트리 검증 규칙(추세/모멘텀/거래량/변동성)을 제시해줘."
- "섹터 로테이션 신호를 2~6주 기준으로 우선순위화하고 근거를 표로 정리해줘."
- "자동매매 긴급대응(비중축소/손절강화/진입차단) 트리거를 임계값 형태로 제시해줘."
