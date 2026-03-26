# Stage4 TTM Squeeze Profile Guide (H8)

Doc-Tier: P2 (Engineering)


작성일: 2026-03-19  
대상: `components/TechnicalAnalysis.tsx`, `constants.ts`

---

## 1) 목적

H8는 "KC 승수 1.5 vs 2.0"을 단순 교체하는 패치가 아니라,  
**운영값 설정 + 검증 + 적응(학습) 구조**를 만드는 작업이다.

- 하드코딩 제거
- 프로파일 기반 운용
- 분석이 쌓일수록 추천 승수를 계산(Shadow/Active 모드)

---

## 2) 현재 기본값

- `BB Std Mult` = `2.0`
- `KC ATR Mult (default)` = `1.5`
- 기본 모드 = `STATIC` (기존 동작 유지)

즉, 설정을 바꾸지 않으면 현재 신호 체계가 변하지 않는다.

### 2-1) 값 선정 근거 (중요)

아래 값들은 "절대 정답"이 아니라 **검증 가능한 초기 기준값(seed)** 이다.

- `BB Std Mult = 2.0`
  - 볼린저밴드의 가장 보편적 기준(20,2)을 유지
  - 기존 분석/지표 해석과 비교 호환성이 높음
- `KC ATR Mult default = 1.5`
  - 현재 운영 로직과 연속성을 유지하면서 급격한 신호 체계 변화 방지
  - Stage4/6 누적 데이터로 추후 재보정 가능
- `STRICT = 1.25`
  - KC를 좁혀 Squeeze 조건을 보수화 (과신호 억제 목적)
  - 변동성 확대 구간(VIX 높음)에서 노이즈 진입을 줄이기 위한 안전값
- `WIDE = 2.0`
  - KC를 넓혀 Squeeze 조건을 완화 (과차단 방지 목적)
  - 저변동 구간에서 기회 누락을 줄이기 위한 완화값
- `VIX 임계 (24/18)`
  - 기존 리스크 레짐 경계(OFF≈24, 저변동≈18 부근)와 정합성 유지
  - 운영자가 쉽게 이해/조정 가능한 숫자
- `Adaptive target on-rate = 0.14~0.28`
  - Squeeze-on 비율이 너무 낮으면(과차단) 샘플 고갈, 너무 높으면(과신호) 품질 저하
  - 관측 기반으로 추천 KC를 미세 조정하기 위한 실무 범위

결론:
- 지금 값은 **확정 진리값**이 아니라, "운영 리스크를 낮춘 시작점"이다.
- 그래서 `ADAPTIVE_SHADOW -> ADAPTIVE_ACTIVE` 순으로 검증 후 전환하도록 설계했다.

---

## 3) 설정 변수 (GitHub Actions Variables / .env)

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `VITE_TTM_SQUEEZE_KC_PROFILE_MODE` | `STATIC` | `STATIC` \| `VIX_DYNAMIC` \| `ADAPTIVE_SHADOW` \| `ADAPTIVE_ACTIVE` |
| `VITE_TTM_SQUEEZE_BB_STD_MULT` | `2.0` | Bollinger 표준편차 배수 |
| `VITE_TTM_SQUEEZE_KC_ATR_MULT_STRICT` | `1.25` | 보수 프로파일 KC ATR 배수 |
| `VITE_TTM_SQUEEZE_KC_ATR_MULT_DEFAULT` | `1.5` | 기본 프로파일 KC ATR 배수 |
| `VITE_TTM_SQUEEZE_KC_ATR_MULT_WIDE` | `2.0` | 완화 프로파일 KC ATR 배수 |
| `VITE_TTM_SQUEEZE_VIX_STRICT_MIN` | `24` | `VIX_DYNAMIC`에서 STRICT 전환 임계 |
| `VITE_TTM_SQUEEZE_VIX_WIDE_MAX` | `18` | `VIX_DYNAMIC`에서 WIDE 전환 임계 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES` | `600` | 적응 추천 활성 최소 샘플 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MIN` | `0.14` | squeeze on-rate 목표 하한 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MAX` | `0.28` | squeeze on-rate 목표 상한 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_STEP` | `0.05` | 추천 승수 조정 스텝 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_MIN_KC` | `1.1` | 추천 KC 하한 |
| `VITE_TTM_SQUEEZE_ADAPTIVE_MAX_KC` | `2.2` | 추천 KC 상한 |

> `VITE_` 없이 동일 키(`TTM_SQUEEZE_*`)도 지원.

---

## 4) 모드 설명

### `STATIC` (기본)
- 항상 `KC=DEFAULT`
- 운영 안정성 최우선

### `VIX_DYNAMIC`
- VIX 기준으로 프로파일 전환
  - `vix >= strict_min` -> `STRICT`
  - `vix <= wide_max` -> `WIDE`
  - 그 외 -> `DEFAULT`

### `ADAPTIVE_SHADOW` (권장 시작점)
- 실제 적용값은 `VIX_DYNAMIC` 결과 사용
- 다만 내부적으로 샘플 누적, 추천 승수 계산
- 추천값은 로그/manifest에서 관찰 가능 (실제 신호에는 미적용)

### `ADAPTIVE_ACTIVE`
- 샘플이 최소치 이상이면 추천 KC를 실제 적용
- 실전 반영 모드이므로 충분한 Shadow 검증 후 전환 권장

---

## 5) 학습(적응) 상태 저장

- 브라우저 `localStorage` 키: `us_alpha_ttm_squeeze_adaptive_v1`
- 저장 필드:
  - `runs`, `samples`
  - `emaSqueezeOnRate`
  - `recommendedKcAtrMult`
  - `lastAppliedKcAtrMult`
  - `updatedAt`

---

## 6) Stage4 산출물에서 확인할 것

`STAGE4_TECHNICAL_FULL_*.json` manifest에 아래가 기록됨:

- `ttmSqueezeProfileMode`
- `ttmSqueezeProfile`
- `ttmSqueezeBbStdMult`
- `ttmSqueezeKcAtrMultBase`
- `ttmSqueezeKcAtrMultApplied`
- `ttmSqueezeProfileReason`
- `ttmSqueezeVixRef`
- `ttmSqueezeAdaptive`
- `ttmSqueezeStats` (sample/on/fired/onRate/adaptiveStateAfterRun)

---

## 7) 운영 권장 순서

1. `STATIC`으로 3~5회 안정성 확인  
2. `ADAPTIVE_SHADOW` 전환 후 최소 600 샘플 관찰  
3. 추천 KC가 안정되면 `ADAPTIVE_ACTIVE` 제한 적용  

핵심 원칙:
- 데이터 부족을 이유로 신호를 임의 왜곡하지 않는다.
- adaptive는 "관찰 -> 검증 -> 적용" 순서로 단계 전환한다.
