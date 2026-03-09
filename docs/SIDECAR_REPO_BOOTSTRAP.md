# Sidecar Repo Bootstrap Guide (2nd Priority)

## Goal
- Create a separate private repo (`alpha-exec-engine`) for execution/simulation.
- Keep `US_Alpha_Seeker` analysis engine untouched.

## What is already prepared here
- A ready-to-copy template exists at:
  - `sidecar-template/alpha-exec-engine/`
- This includes:
  - minimal Node/TypeScript scaffold
  - CI (`.github/workflows/ci.yml`)
  - read-only safe defaults (`EXEC_ENABLED=false`, `READ_ONLY=true`)

## What you need to do (owner actions)
1. Create private GitHub repository: `alpha-exec-engine`
2. Copy template files into that repo root
3. Set repository secrets (sidecar only):
   - `ALPACA_KEY_ID`
   - `ALPACA_SECRET_KEY`
   - `ALPACA_BASE_URL`
   - `TELEGRAM_TOKEN`
   - `TELEGRAM_PRIMARY_CHAT_ID`
   - `TELEGRAM_SIMULATION_CHAT_ID`
   - `GDRIVE_API_KEY`
   - `GDRIVE_ROOT_FOLDER_ID`
   - `GDRIVE_STAGE6_FOLDER`
   - `GDRIVE_REPORT_FOLDER`
4. Keep initial runtime flags:
   - `EXEC_ENABLED=false`
   - `READ_ONLY=true`
5. Run first CI build and confirm green.

## Local quick test (before pushing)
```bash
cd sidecar-template/alpha-exec-engine
npm install
npm run build
node dist/src/index.js
```

## First commit suggestion (in sidecar repo)
`chore(sidecar): bootstrap alpha-exec-engine private scaffold with safe defaults`
