# Notion Archive & Retention Workorder (2026-04-02)

이 문서는 **Notion AI에 그대로 전달 가능한 실행 지시서**입니다.  
목표는 3가지입니다:

1) 운영 가독성 유지 (최신 데이터 빠르게 조회)  
2) 장기 데이터 누적 (학습/튜닝 기반 유지)  
3) 자동화 파이프라인 안전성 유지 (컬럼 오작동 방지)

---

## 0) 절대 규칙 (중요)

아래 6개는 반드시 지켜야 합니다.

1. 기존 DB 삭제 금지  
2. 기존 row 삭제 금지  
3. 자동화 핵심 컬럼명 rename 금지  
4. 자동화 핵심 컬럼 타입 임의 변경 금지  
5. 모호하면 “새 컬럼 추가” 우선, 기존 컬럼 수정 최소화  
6. 적용 후 01_* 운영 뷰에서 최신 row가 항상 보이도록 유지

---

## 1) 왜 `Stock Scores / AI Alpha Analysis / Portfolio Watchlist`가 비는가

이 3개 DB는 현재 구조상 **항상 채워지는 DB가 아닙니다**.

- 채움 경로: `api/notion_sync.ts`
- 입력 소스: `executablePicks`, `watchlist`
- 실행 결과가 비거나 해당 API 호출이 없으면 row가 생성되지 않음

즉, 빈 값/빈 날짜는 “수집 실패”가 아니라 “입력 소스 자체 없음”인 경우가 많습니다.

---

## 2) DB 역할 분리 (운영/장기 보관)

운영 DB(Hot)와 장기 보관(Archive)을 분리합니다.

- **Hot (0~45일)**: 기본 운영 뷰, 빠른 확인
- **Warm (46~120일)**: 히스토리 조회
- **Archive (121일+)**: 장기 저장/학습용

학습/튜닝 관점에서는 Archive를 최대한 길게 보관하는 것이 유리합니다.

---

## 3) 작업 범위 DB

필수 대상:

- `📅 Daily Snapshot`
- `🛡️ Guard Action Log`
- `📈 HF Tuning Tracker`
- `📉 Performance Dashboard`

보조 대상:

- `📊 Stock Scores`
- `🧠 AI Alpha Analysis`
- `🎯 Portfolio Watchlist`
- `⚠️ Automation Incident Log`
- `🧾 Key Rotation Ledger`

---

## 4) 스키마/뷰 상세 지시 (오해 방지 버전)

### A) 공통 보조 컬럼 추가 (고용량 DB)

대상: Daily Snapshot, Guard Action Log, HF Tuning Tracker, Performance Dashboard

1. `Bucket Month` (Formula, Text 결과)
   - Formula:
   - `formatDate(if(empty(prop("Time")), prop("Date"), prop("Time")), "YYYY-MM")`

2. `Archive Candidate` (Formula, Checkbox 결과)
   - Formula:
   - `if(empty(prop("Time")), dateBetween(now(), prop("Date"), "days") > 120, dateBetween(now(), prop("Time"), "days") > 120)`

3. 뷰 2개 추가
   - `98_Warm` : 45일 이전 데이터
   - `99_Archive_Candidate` : `Archive Candidate = true`

---

### B) Daily Snapshot

- 기존 컬럼/타입 유지
- `01_Production Runs` 뷰 컬럼 최소화:
  - Run Date, Date, Status, Source, Engine
  - Market Condition, VIX Level
  - Stage 6 Count, Final Picks Count
  - Payload Count, Skipped Count
  - Guard Level, HF Gate, HF Live Promotion
  - Summary
- `99_Smoke/Test` 뷰 유지

---

### C) Guard Action Log

- 자동화 안전을 위해 아래 컬럼 유지:
  - Run Key, Time, Level, Action, Symbol, Result, Reason, OrderId, Raw Status, Source, Engine, Status
- `Level`은 현재 Select/Text 어느 쪽이든 유지 가능  
  (자동화는 양쪽 대응 가능하도록 구현됨)
- 권장 추가:
  - `Level Num` (number)
  - `Run Day` (formula): `formatDate(prop("Time"), "YYYY-MM-DD")`
- 뷰:
  - `01_Recent` (Time desc)
  - `02_Failed_or_Skipped` (Result in failed/skipped)
  - `03_Last_7d` (최근 7일)

---

### D) HF Tuning Tracker

- 자동화 안전을 위해 아래 컬럼 유지:
  - Run Key, Time, Gate Progress, Perf Gate, Freeze Status, Live Promotion, Payload Probe, Alert, Decision, Stage6 File, Stage6 Hash, Source, Engine, Status
- `Alert`는 Checkbox 또는 Select 모두 허용
  - Select 사용 시 옵션: `CLEAR`, `TRIGGERED`, `N/A`
- `Decision`은 Select 또는 Text 모두 허용
  - 권장: `Decision (Text)` 보조 컬럼 추가
- 뷰:
  - `01_Gate_Status` (최신 상태)
  - `02_Attention_Needed` (Alert=TRIGGERED 또는 Perf Gate!=GO 또는 Live Promotion in HOLD/BLOCK)
  - `03_Progress_Trend` (Time desc)

---

### E) Performance Dashboard

- 필수 컬럼 유지:
  - Run Key, Time, Kind, Status, Source, Batch ID
  - Sim Rows/Filled/Open/Closed
  - Sim Win Rate %, Sim Avg Closed Return %, Sim Avg Closed R
  - Live Available, Live Position Count, Live Unrealized PnL, Live Return %, Live Equity
  - Series, Summary
- `Kind` 옵션 정규화:
  - `dry_run`, `market_guard`, `local`, `live`, `manual`, `other`
- 퍼센트 컬럼 형식 반드시 Percent:
  - `Sim Win Rate %`, `Sim Avg Closed Return %`, `Live Return %`
- 뷰:
  - `01_Latest` (Time desc)
  - `02_Simulation_Trend` (Kind in dry_run/local)
  - `03_Live_Exposure` (Live Available=true)

---

## 5) 장기 운영 정책 (월 1회)

월 1회(예: 매월 1일) 아래 수행:

1. `99_Archive_Candidate` 뷰의 row를 월별로 확인
2. Archive DB/페이지로 이동 또는 복제
3. Hot DB는 최근 120일 중심으로 유지
4. 삭제 전 반드시 CSV/JSON 백업

권장: 삭제보다 “Archive DB 분리”를 우선

---

## 6) Notion AI 전달용 복붙 텍스트

```md
You are updating my existing Notion workspace for US Alpha Seeker.

Hard constraints:
1) Do NOT delete any database.
2) Do NOT delete any existing rows.
3) Do NOT rename automation-critical properties.
4) Keep latest rows visible in 01_* views.
5) If uncertain, add a helper property/view instead of changing core schema.

Databases in scope:
- 📅 Daily Snapshot
- 🛡️ Guard Action Log
- 📈 HF Tuning Tracker
- 📉 Performance Dashboard
- 📊 Stock Scores
- 🧠 AI Alpha Analysis
- 🎯 Portfolio Watchlist
- ⚠️ Automation Incident Log
- 🧾 Key Rotation Ledger

Tasks:
A) Add common retention scaffolding for high-volume DBs:
   - Bucket Month (formula):
     formatDate(if(empty(prop("Time")), prop("Date"), prop("Time")), "YYYY-MM")
   - Archive Candidate (formula):
     if(empty(prop("Time")), dateBetween(now(), prop("Date"), "days") > 120, dateBetween(now(), prop("Time"), "days") > 120)
   - Add views:
     98_Warm (older than 45 days)
     99_Archive_Candidate (Archive Candidate = true)

B) Daily Snapshot:
   - Keep schema.
   - Ensure 01_Production Runs is compact (operational columns only).
   - Keep 99_Smoke/Test.

C) Guard Action Log:
   - Keep core columns:
     Run Key, Time, Level, Action, Symbol, Result, Reason, OrderId, Raw Status, Source, Engine, Status
   - Add Level Num (number), Run Day formula.
   - Views: 01_Recent, 02_Failed_or_Skipped, 03_Last_7d.

D) HF Tuning Tracker:
   - Keep core columns:
     Run Key, Time, Gate Progress, Perf Gate, Freeze Status, Live Promotion, Payload Probe, Alert, Decision, Stage6 File, Stage6 Hash, Source, Engine, Status
   - Alert may be checkbox or select; if select, options are CLEAR/TRIGGERED/N/A.
   - Decision may be select or text; add Decision (Text) helper if needed.
   - Views: 01_Gate_Status, 02_Attention_Needed, 03_Progress_Trend.

E) Performance Dashboard:
   - Keep schema.
   - Normalize Kind options:
     dry_run, market_guard, local, live, manual, other
   - Ensure percent-format columns:
     Sim Win Rate %, Sim Avg Closed Return %, Live Return %
   - Views: 01_Latest, 02_Simulation_Trend, 03_Live_Exposure.

Validation (must pass):
1) No deletion/rename on core automation columns.
2) Latest rows still visible in all 01_* views.
3) Archive scaffolding exists on all high-volume DBs.
4) Performance percent columns are still percent type.
```

---

## 7) 적용 후 체크 (운영자)

1. Sidecar dry-run 1회 후:
   - Daily Snapshot / HF Tuning Tracker / Performance Dashboard 최신 row 확인
2. Market Guard 1회 후:
   - Guard Action Log 최신 row 확인
3. Stock/AI/Watchlist:
   - 해당 런에서 `executablePicks/watchlist`가 없으면 빈 상태가 정상인지 확인
4. 퍼센트 컬럼:
   - `Live Return %` 등 이상치(예: -1000%대) 재발 여부 확인

---

## 8) 운영 브리핑 (현재 기준)

### 결론

- 현재 구성은 **보관 후보를 자동 식별**하는 상태입니다.
- 즉, `98_Warm`, `99_Archive_Candidate` 뷰와 Formula는 자동으로 갱신되지만,
- **row 이동/복제/삭제는 자동으로 실행되지 않습니다.**

### 월간 보관 운영이 자동인가?

- 답: **아직은 수동 운영**입니다.
- 지금은 “후보 표시 자동화”까지만 적용되어 있고,
- “실제 보관(Archive DB 이동)”은 운영자가 월 1회 실행해야 합니다.

### 우리가 매월 해야 할 일 (수동 운영 SOP)

1. `99_Archive_Candidate` 뷰 열기
2. 월 단위(`Bucket Month`)로 대상 확인
3. CSV/JSON 백업
4. Archive DB/페이지로 이동(또는 복제)
5. 운영 DB 최신성 확인 (`01_*` 뷰)
6. Sidecar dry-run 1회로 적재 이상 유무 확인

---

## 9) 다음 단계 (자동화 옵션)

원하면 아래 3단계로 자동화할 수 있습니다.

### A안 (권장 시작점: 반자동)

- GitHub Actions 월 1회 스케줄
- 수행 내용:
  - Archive 후보 row 목록 리포트 생성
  - 백업 파일(JSON/CSV) 저장
  - 텔레그램/노션 알림 전송
- 실제 이동은 운영자 승인 후 수동

### B안 (완전 자동)

- 월간 스케줄에서 Archive DB로 자동 복제/이동
- 성공/실패를 `⚠️ Automation Incident Log`에 기록
- 실패 시 재시도 + 알림

### C안 (현재 유지)

- 지금처럼 수동 월간 운영 유지
- 구현 리스크 가장 낮음
- 운영자 개입 필요

---

## 10) 추천 운영안

현재 단계에서는 **A안(반자동)**이 가장 안전합니다.

- 이유:
  - 데이터 보존 안정성 확보
  - 오작동 시 대량 이동 사고 방지
  - 점진적으로 자동화 품질 확보 가능
