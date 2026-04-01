# Notion Workspace Remediation Workorder (2026-03-31)

이 문서는 현재 Notion 자동 동기화 상태를 기준으로,  
`입력 누락`, `가독성 저하`, `무한 적재`를 동시에 해결하기 위한 실행용 작업지시서입니다.

---

## 0) 정밀 점검 결론 (요약)

현재 핵심 DB 9개는 모두 존재하고 기본 동기화는 동작합니다.  
다만 아래 4개는 **스키마-자동화 매핑 불일치**로 누락/혼선이 발생할 수 있습니다.

1. `🛡️ Guard Action Log`
   - `Level`이 Select(`L0~L3`)인데, 자동화는 숫자/텍스트 기반으로 적재하려고 시도.
   - `Workflow` 컬럼은 존재하지만 자동화 적재 컬럼은 아님(뷰용 보조 컬럼으로 유지 권장).

2. `📈 HF Tuning Tracker`
   - `Alert`가 Checkbox인데 자동화 payload는 상태 문자열 기반(`CLEAR:*`, `TRIGGERED:*`)으로 생성.
   - `Decision`이 Select인데 자동화는 텍스트 기반 결정문으로 생성.

3. `📉 Performance Dashboard`
   - `Kind` 옵션이 `dry/local/live/other` + `dry_run/market_guard` 혼재.
   - `02_Simulation_Trend` 뷰가 `dry/local`만 잡으면 `dry_run` 행이 누락될 수 있음.

4. `📅 Daily Snapshot`
   - 운영에 필요한 컬럼은 충분하지만 기본 뷰 노출 컬럼이 너무 많아 운영 가독성이 떨어짐.

---

## 1) 변경 원칙 (중요)

- 기존 DB/행 **삭제 금지**
- 자동화가 쓰는 기존 컬럼명은 **rename 금지**
- 변경은 `속성 타입 정합 + 뷰 정리 + 보관 정책` 중심
- 테스트/스모크 데이터는 삭제보다 `99_*` 뷰로 격리

---

## 2) DB별 수정안 (실행 우선순위)

## P0 (오늘 바로)

### A. 🛡️ Guard Action Log
- 유지: `Run Key`, `Time`, `Action`, `Result`, `Reason`, `OrderId`, `Raw Status`, `Source`, `Engine`, `Status`, `Symbol`
- 수정:
  - `Level`을 **Text**로 변경 (값 예: `L3`)
  - `Level Num`(Number) 신규 추가 (필요 시 수치 필터용)
  - `Run Day`(Formula) 신규 추가: `formatDate(prop("Time"), "YYYY-MM-DD")`
- 뷰:
  - `01_Recent` (기존 유지, Time desc)
  - `02_Failed_or_Skipped` (기존 유지)
  - `03_Last_7d` (신규, Time within past week)

### B. 📈 HF Tuning Tracker
- 유지: `Run Key`, `Time`, `Gate Progress`, `Perf Gate`, `Freeze Status`, `Live Promotion`, `Payload Probe`, `Stage6 File`, `Stage6 Hash`, `Source`, `Engine`, `Status`
- 수정:
  - `Alert`를 **Select**로 변경  
    - 옵션: `CLEAR`, `TRIGGERED`, `N/A`
  - `Decision`을 **Text**로 변경
  - `Gate Current`(Formula) 신규: `prop("Perf Gate") + " / " + prop("Freeze Status")`
- 뷰:
  - `01_Gate_Status` (기존 유지)
  - `02_Attention_Needed` (기존 유지)
  - `03_Progress_Trend` (신규, Time desc, 핵심 컬럼만)

### C. 📉 Performance Dashboard
- 유지: `Run Key`, `Time`, `Status`, `Source`, `Batch ID`, `Sim*`, `Live*`, `Series`, `Summary`
- 수정:
  - `Kind` 옵션을 아래로 정규화:
    - `dry_run`, `market_guard`, `local`, `live`, `manual`, `other`
  - 퍼센트 컬럼 형식 확인:
    - `Sim Win Rate %`, `Sim Avg Closed Return %`, `Live Return %` = Percent
- 뷰:
  - `01_Latest` (기존 유지)
  - `02_Simulation_Trend` 필터를 아래로 확장:
    - `Kind in (dry_run, local)` 또는
    - `Kind contains "dry"` OR `Kind contains "local"`
  - `03_Live_Exposure` 신규:
    - `Live Available = true`
    - `Time desc`

---

## P1 (이번 주)

### D. 📅 Daily Snapshot (운영 가독성)
- 스키마는 유지.
- `01_Production Runs` 표시 컬럼 최소화:
  - `Run Date`, `Date`, `Status`, `Source`, `Engine`,
  - `Market Condition`, `VIX Level`,
  - `Stage 6 Count`, `Final Picks Count`,
  - `Payload Count`, `Skipped Count`,
  - `Guard Level`, `HF Gate`, `HF Live Promotion`,
  - `Summary`
- `99_Smoke/Test` 유지.

### E. 📊 Stock Scores / 🧠 AI Alpha Analysis / 🎯 Portfolio Watchlist
- 기본 스키마 유지.
- 각 DB에 `01_Operations` 뷰 추가:
  - 운영 핵심 컬럼만 노출
  - `Date desc` 정렬

---

## 3) 데이터 무한 증가 대응 (Retention)

핫/웜/아카이브 3계층으로 운영:

1. **Hot (0~45일)**: 기본 운영 뷰
2. **Warm (46~120일)**: 조회용 보조 뷰
3. **Archive (121일+)**: 아카이브 뷰/페이지로 이동

각 DB에 공통 보조 속성 추가 권장:
- `Bucket Month` (Formula): `formatDate(prop("Time"), "YYYY-MM")` 또는 Date 기준
- `Archive Candidate` (Formula/Checkbox):
  - 120일 초과 시 true

각 DB 공통 뷰:
- `98_Warm` (45일 이전)
- `99_Archive_Candidate` (Archive Candidate=true)

---

## 4) Notion AI 전달용 작업지시서 (복붙)

```md
You are updating my existing Notion operations workspace for US Alpha Seeker.

Hard rules:
1) Do not delete any existing database.
2) Do not delete any existing row.
3) Do not rename automation-critical properties.
4) Apply type fixes and view cleanup only.

Databases in scope:
- 📅 Daily Snapshot
- 📊 Stock Scores
- 🧠 AI Alpha Analysis
- 🎯 Portfolio Watchlist
- 🛡️ Guard Action Log
- 📈 HF Tuning Tracker
- ⚠️ Automation Incident Log
- 🧾 Key Rotation Ledger
- 📉 Performance Dashboard

==================================================
STEP A) Schema fixes
==================================================

1) In 🛡️ Guard Action Log:
- Ensure these properties exist and keep exact names:
  Run Key, Time, Action, Symbol, Result, Reason, OrderId, Raw Status, Source, Engine, Status
- Change `Level` property type to TEXT (not select).
- Add `Level Num` (number).
- Add formula `Run Day` = formatDate(prop("Time"), "YYYY-MM-DD")

2) In 📈 HF Tuning Tracker:
- Ensure these properties exist and keep exact names:
  Run Key, Time, Gate Progress, Perf Gate, Freeze Status, Live Promotion, Payload Probe, Alert, Decision, Stage6 File, Stage6 Hash, Source, Engine, Status
- Change `Alert` property type to SELECT with options: CLEAR, TRIGGERED, N/A
- Change `Decision` property type to TEXT
- Add formula `Gate Current` = prop("Perf Gate") + " / " + prop("Freeze Status")

3) In 📉 Performance Dashboard:
- Keep existing core properties.
- Normalize `Kind` options to:
  dry_run, market_guard, local, live, manual, other
- Confirm `%` format for:
  Sim Win Rate %, Sim Avg Closed Return %, Live Return %

4) In 📅 Daily Snapshot:
- Keep schema.
- No delete/rename.

==================================================
STEP B) View cleanup
==================================================

1) 🛡️ Guard Action Log
- 01_Recent: sort Time desc
- 02_Failed_or_Skipped: Result in (failed, skipped), sort Time desc
- 03_Last_7d: Time is within past week

2) 📈 HF Tuning Tracker
- 01_Gate_Status: sort Time desc
- 02_Attention_Needed:
  Alert = TRIGGERED OR Perf Gate != GO OR Live Promotion in (HOLD, BLOCK)
- 03_Progress_Trend: Time desc, compact columns only

3) 📉 Performance Dashboard
- 01_Latest: Time desc
- 02_Simulation_Trend:
  Kind in (dry_run, local) OR Kind contains "dry" OR Kind contains "local"
- 03_Live_Exposure:
  Live Available = true, Time desc

4) 📅 Daily Snapshot
- 01_Production Runs:
  Source != smoke, sort Date desc then Created desc
  show only operational columns
- 99_Smoke/Test:
  Source = smoke OR Run Date contains smoke

==================================================
STEP C) Retention scaffolding
==================================================

For high-volume DBs (Daily Snapshot, Guard Action Log, HF Tuning Tracker, Performance Dashboard):
- Add formula `Bucket Month`:
  formatDate(if(empty(prop("Time")), prop("Date"), prop("Time")), "YYYY-MM")
- Add formula/checkbox `Archive Candidate` for rows older than 120 days
- Add views:
  98_Warm (older than 45 days)
  99_Archive_Candidate (Archive Candidate = true)

Final validation:
1) No rows deleted
2) Existing automation property names preserved
3) New views created
4) Latest rows still visible in 01_* views
```

---

## 5) 적용 후 검증 체크리스트

1. Sidecar dry-run 1회 실행 후 확인
   - Daily Snapshot 행 생성/업데이트
   - HF Tuning Tracker의 `Alert`, `Decision` 채워짐 확인

2. Market Guard 1회 실행 후 확인
   - Guard Action Log의 `Level`/`Result`/`Reason` 채워짐 확인

3. Performance Dashboard 확인
   - `01_Latest` 최신 행 반영
   - `02_Simulation_Trend`가 비지 않는지 확인

4. 7일 운영 후
   - `98_Warm`, `99_Archive_Candidate` 뷰 필터 정상 여부 점검

