# Public -> Private Cutover Checklist

Use this checklist for the planned visibility cutover on **April 1, 2026**.

---

## 1) Before cutover (public period)

- [ ] Keep real-money credentials out of workflows (paper/test keys only).
- [ ] Confirm build outputs are not tracked (`dist/`, `build/` ignored).
- [ ] Confirm no key-like strings are committed outside ignored paths.
- [ ] Pause non-essential scheduled workflows during the cutover window.

Quick checks

```bash
git ls-files 'dist/**' 'build/**'
rg -n --hidden -g '!**/node_modules/**' -g '!.git/**' \
  -e 'OPENAI_API_KEY\\s*=\\s*\\S+' \
  -e 'ALPACA_(API_KEY|SECRET_KEY)\\s*=\\s*\\S+' \
  -e 'TELEGRAM_BOT_TOKEN\\s*=\\s*\\S+'
```

---

## 2) Cutover moment (visibility switch)

- [ ] Set repository visibility to **Private**.
- [ ] Disable public access paths you no longer need (temporary links, docs previews, etc.).

---

## 3) Immediately after cutover

- [ ] Revoke and reissue all API keys/tokens:
  - [ ] OpenAI
  - [ ] Alpaca
  - [ ] Telegram bot token
  - [ ] GitHub PAT / dispatch token (`SIDECAR_DISPATCH_TOKEN`)
  - [ ] Any additional provider keys used in automation
- [ ] Update GitHub Secrets/Variables with newly issued values.
- [ ] Remove old credentials from local `.env` and CI contexts.
- [ ] Run smoke checks once:
  - [ ] `sidecar-dry-run`
  - [ ] `sidecar-market-guard`
- [ ] Confirm no `401`/`403`/`Bad credentials` in logs.

---

## 4) Completion criteria

- [ ] Repo is private.
- [ ] Credential rotation complete (old keys revoked).
- [ ] Smoke tests pass with new credentials.
- [ ] No auth failures in the first post-cutover cycle.
