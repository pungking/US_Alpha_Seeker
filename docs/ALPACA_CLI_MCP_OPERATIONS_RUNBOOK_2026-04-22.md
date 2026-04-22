# Alpaca CLI + MCP Operations Runbook (2026-04-22)

## 0) Scope
- Repository: `US_Alpha_Seeker`
- Goal:
  1. Add Alpaca MCP to ops profile in read-only mode.
  2. Add Alpaca CLI install and health-check routine.
  3. Keep execution authority in sidecar runtime (`alpha-exec-engine`) only.

## 1) Read-only MCP Policy (Non-negotiable)
- MCP path is for operator visibility and evidence collection.
- No order placement from MCP layer.
- Toolset restriction is enforced with:
  - `MCP_ALPACA_TOOLSETS_READONLY=assets,stock-data,crypto-data,options-data,corporate-actions,news`
- Live toggle is blocked at MCP level by default:
  - `MCP_ALPACA_PAPER_TRADE=true`

Reference (official Alpaca MCP):
- `ALPACA_PAPER_TRADE` default `true`
- `ALPACA_TOOLSETS` toolset filtering supported in v2

## 2) Ops Profile Wiring
Updated files:
- `.vscode/mcp.profile.ops.template.json`
- `.vscode/mcp.env.example`

New MCP server entry:
- server: `alpaca-mcp`
- command: `uvx alpaca-mcp-server`
- env mapping:
  - `ALPACA_API_KEY <- ALPACA_KEY_ID`
  - `ALPACA_SECRET_KEY <- ALPACA_SECRET_KEY`
  - `ALPACA_PAPER_TRADE <- MCP_ALPACA_PAPER_TRADE`
  - `ALPACA_TOOLSETS <- MCP_ALPACA_TOOLSETS_READONLY`

Apply profile:
```bash
npm run mcp:sync:ops
npm run mcp:check
npm run mcp:smoke
```

## 3) Alpaca CLI Installation
Official install options (`alpacahq/cli`):

### macOS / Linux (Homebrew)
```bash
brew install alpacahq/tap/cli
```

### Go install
```bash
go install github.com/alpacahq/cli/cmd/alpaca@latest
```

Verify:
```bash
alpaca version
```

## 4) Alpaca CLI Health Check
New scripts:
- `npm run ops:alpaca:cli:health`
- `npm run ops:alpaca:cli:health:strict`

Optional HTTP probe (account endpoint):
```bash
ALPACA_CLI_HEALTH_HTTP_PROBE=true npm run ops:alpaca:cli:health
```

Strict gate (non-zero exit on failure):
```bash
ALPACA_CLI_HEALTH_STRICT=true ALPACA_CLI_HEALTH_HTTP_PROBE=true npm run ops:alpaca:cli:health
```

Checks performed:
- `alpaca` command installed (`alpaca version` or `alpaca --version`)
- `ALPACA_BASE_URL` points to paper endpoint
- `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY` presence
- optional `/v2/account` probe with masked output

## 5) Automated Normal-Preflight Canary Recheck
Workflow added:
- `/.github/workflows/sidecar-preflight-canary-recheck.yml`

What it does:
1. Dispatches `pungking/alpha-exec-engine` `dry-run.yml` with:
   - `run_disable_order_idempotency=true`
   - `run_force_send_once=true`
   - `run_allow_entry_outside_rth=false`
   - `run_dry_max_orders_override=2`
   - `run_dry_max_total_notional_override=200`
2. Waits for completion.
3. Pulls target run logs and verifies:
   - `[PREFLIGHT] status=PASS`
   - `[BROKER_SUBMIT] ... attempted>=1 ... submitted>=1`

Pass criteria:
- workflow completes success,
- both preflight and broker submit assertions pass.

## 6) Safety Notes
- This runbook does **not** change sidecar execution defaults.
- Paper trading boundary remains:
  - `ALPACA_BASE_URL=https://paper-api.alpaca.markets`
- Do not enable MCP `trading` toolset in ops baseline.
- Do not use Alpaca CLI destructive commands (`cancel-all`, `close-all`) without explicit operator intent.
