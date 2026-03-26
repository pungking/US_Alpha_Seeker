# SIDECAR Environment Matrix

Doc-Tier: P2 (Engineering)


## 목적
- 실행 엔진(sidecar)에서 필요한 환경변수/시크릿을 표준화한다.
- 분석 레포와 실행 레포의 시크릿을 분리 운영한다.

## 기본 운영 플래그
| Key | Required | Default | 설명 |
|---|---|---|---|
| `EXEC_ENABLED` | Y | `false` | 전체 실행 on/off 킬스위치 |
| `READ_ONLY` | Y | `true` | 주문 금지 드라이런 모드 |
| `POLICY_VERSION` | Y | `stage6-exec-v1.0-rc1` | 정책 버전 고정 |
| `TZ` | Y | `America/New_York` | 장 시간 판정 타임존 |

## Alpaca (Paper)
| Key | Required | 설명 |
|---|---|---|
| `ALPACA_KEY_ID` | Y | Alpaca API key |
| `ALPACA_SECRET_KEY` | Y | Alpaca API secret |
| `ALPACA_BASE_URL` | Y | Paper URL (`https://paper-api.alpaca.markets`) |

## Google Drive
| Key | Required | 설명 |
|---|---|---|
| `GDRIVE_API_KEY` | Y | Drive API 키 |
| `GDRIVE_ROOT_FOLDER_ID` | Y | 루트 폴더 ID |
| `GDRIVE_STAGE6_FOLDER` | Y | Stage6 폴더명/ID |
| `GDRIVE_REPORT_FOLDER` | Y | Report 폴더명/ID |

## Telegram
| Key | Required | 설명 |
|---|---|---|
| `TELEGRAM_TOKEN` | Y | 공통 봇 토큰 |
| `TELEGRAM_PRIMARY_CHAT_ID` | Y | 기존 분석 리포트 채널 (`-1003800785574`) |
| `TELEGRAM_SIMULATION_CHAT_ID` | Y | 시뮬레이션 채널 (`1281749368`) |

## Stage Lock / Contract
| Key | Required | Default | 설명 |
|---|---|---|---|
| `STAGE5_LOCK_MODE` | Y | `LATEST` | `LATEST`/`LOCKED` |
| `STAGE5_LOCK_FILE_NAME` | N | - | LOCKED 모드에서 고정 파일명 |
| `CONTRACT_PRICE_TOLERANCE` | Y | `0.05` | 가격 비교 허용 오차 |
| `CONTRACT_ER_TOLERANCE_PCT` | Y | `1.0` | 기대수익률 허용 오차(%p) |

## 운영 권장
- 분석 레포(`US_Alpha_Seeker`)와 실행 레포(`alpha-exec-engine`)의 Secrets는 분리한다.
- 실행 레포에서만 `ALPACA_*`를 보유한다.
- 초기 1~2주는 `EXEC_ENABLED=false`, `READ_ONLY=true` 유지한다.
