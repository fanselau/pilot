# Pilot v2 Test Results — 2026-03-04

## Phase 2: Build & Merge ✅
- Clean working tree on v2 branch
- `npm run build` — success
- `npm test` (vitest) — **301/301 tests passed** (12 test files)
- Pushed v2, merged into dev, pushed dev
- No staging/main branches exist — v2 → dev is the flow

## Phase 3: E2E Testing ❌ (OOM)

### Environment
- 16GB VPS, ~6.7GB available at start
- Existing opencode interactive session (PID 4003156) consuming ~1.4GB (opencode + pyright)
- OpenClaw gateway: ~527MB
- Docker: ~453MB
- When pilot spawns a new opencode process, total exceeds available → SIGKILL (OOM)

### Test 1: Quick task — FAILED (OOM)
- Job 7ece queued successfully
- `pilot run --once` → process spawned but immediately OOM killed
- Same failure as earlier job 7phc (6 hours ago)
- Manual `opencode run` also gets OOM killed

### Root Cause
No swap configured. An interactive opencode session on pts/5 (running since Mar02) is consuming ~1.4GB. Pilot can't spawn additional opencode processes without running out of memory.

### Recommendation
- Add swap (2-4GB) to prevent OOM
- Or close the existing interactive opencode session before running pilot
- Or reduce memory usage of other services

## Tests Not Run
- Test 2: Phase from scratch
- Test 3: Continue existing phase
- Test 4: Judge evaluation
- Test 5: Failure + retry

## Summary
Unit tests: ✅ 301/301 passed
E2E tests: ❌ Blocked by OOM (insufficient RAM for concurrent opencode processes)
