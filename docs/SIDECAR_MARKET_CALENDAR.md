# SIDECAR Market Calendar Standard

## Purpose
- Fix one market-time standard so scheduler, guard jobs, and execution decisions are deterministic.

## Timezone
- Canonical timezone: `America/New_York`
- All session checks must be evaluated in ET (not local server time).

## Regular Session (NYSE/Nasdaq)
- Open: `09:30 ET`
- Close: `16:00 ET`
- Core execution scope for v1: regular session only.

## Pre/Post Market
- v1 policy: no new execution during pre/post market.
- Exception handling is out of scope for v1.

## DST Rule
- Follow IANA timezone (`America/New_York`) automatically.
- Do not hardcode UTC offsets in execution logic.

## Holiday Source
- Reference exchange calendar: NYSE official trading calendar.
- Sidecar should cache holiday/early-close metadata daily.

## Early Close Rule
- On early-close day:
  - no new entries after `12:30 ET`
  - cancel unfilled DAY entries `30m` before close

## NO_EXECUTION_DAY Conditions
Emit `NO_EXECUTION_DAY` when any condition is true:
- Saturday/Sunday (ET)
- US exchange holiday
- calendar data unavailable
- emergency kill-switch active (`EXEC_ENABLED=false`)

## Guard Job Window
- Run `market-guard` only during regular session:
  - every `5-10 min`
- Outside session:
  - monitor only,
  - no new order placement.
