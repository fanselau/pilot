---
phase: 260321-vga
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/commands/doctor.ts
  - test/commands/doctor.test.ts
  - docs/RUNTIME.md
  - docs/GETTING-STARTED.md
autonomous: true
requirements:
  - RUNTIME-UNIFY

must_haves:
  truths:
    - "pilot doctor warns when the systemd service ExecStart binary differs from the current build output (shadow path drift detection)"
    - "operator documentation explains the canonical binary path, what pilot update does, what pilot setup --refresh does, and the correct rebuild workflow"
    - "an operator running bun run build && pilot reload can trust the service is on the new code, and pilot doctor confirms it"
  artifacts:
    - path: "src/commands/doctor.ts"
      provides: "Shadow path drift detection in doctor system health check"
      contains: "binary drift|shadow.*path|build.*drift"
    - path: "test/commands/doctor.test.ts"
      provides: "Tests for drift detection doctor check"
      contains: "drift|shadow|build path"
    - path: "docs/RUNTIME.md"
      provides: "Operator documentation for runtime/install path unification"
      contains: "canonical.*binary|shadow.*path|rebuild.*workflow"
  key_links:
    - from: "src/commands/doctor.ts"
      to: "src/commands/service.ts"
      via: "resolvePilotBinary() shared canonical resolution"
      pattern: "resolvePilotBinary"
    - from: "docs/RUNTIME.md"
      to: "src/commands/service.ts"
      via: "documents the canonical path the service uses"
      pattern: "dist/index.js|resolvePilotBinary"
---

<objective>
Unify Pilot's runtime/install path story: add doctor drift detection for shadow path divergence, and create comprehensive operator documentation explaining the canonical binary, rebuild workflow, and what each update command does.

Purpose: Pilot has a solved canonical binary resolution (Phase 53 `resolvePilotBinary()`) but lacks runtime drift detection and operator-facing documentation. This causes confusion when the service binary and build output diverge silently.

Output: Doctor drift check + docs/RUNTIME.md operator guide + SUMMARY.md
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/pilot-runtime-install-path-unification.md
@src/commands/service.ts
@src/commands/doctor.ts
@src/commands/update.ts
@src/commands/reload.ts
@test/commands/service.test.ts
@test/commands/doctor.test.ts
@docs/GETTING-STARTED.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/commands/service.ts:
```typescript
// Canonical binary resolution — never uses argv
function resolvePilotBinary(): string;
// Resolution chain: 1. import.meta.url → dist/index.js  2. which pilot  3. throw
export { serviceCommand, resolvePilotBinary };
```

From src/commands/doctor.ts:
```typescript
interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}
// Existing service unit check is at line ~557-615 (parses ExecStart, validates binary exists)
// New drift check should go AFTER the existing service unit check
```

From src/commands/update.ts:
```typescript
// pilot update: 1. bun update get-shit-done-cc  2. re-run installer per project  3. update OpenClaw skill
// Does NOT rebuild pilot itself or restart the service
async function updateCommand(): Promise<void>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add binary drift detection to pilot doctor</name>
  <files>src/commands/doctor.ts, test/commands/doctor.test.ts</files>
  <behavior>
    - Test 1: doctor reports "pass" when service ExecStart binary matches current build output (resolvePilotBinary())
    - Test 2: doctor reports "warn" when service ExecStart binary path differs from resolvePilotBinary() result (shadow path drift)
    - Test 3: doctor reports "warn" with actionable message: includes both paths and suggests "bun run build && pilot service install && pilot reload"
    - Test 4: drift check is skipped gracefully when no service unit exists (existing warn behavior unchanged)
  </behavior>
  <action>
Add a "binary drift" doctor check in `src/commands/doctor.ts` AFTER the existing service unit health check (~line 615).

**Implementation:**

1. Import `resolvePilotBinary` from `../commands/service.js` at the top of doctor.ts (it's already exported).

2. After the existing service unit check block, add a new drift detection check:
   - Call `resolvePilotBinary()` to get the canonical build path
   - Apply `realpathSync()` to it (same as service install does)
   - Extract the pilot binary path from the existing ExecStart parsing (reuse the `pilotBinaryPath` variable — it's in the same scope OR re-parse from `unitContent` which is already read)
   - Compare the two paths after `realpathSync()` normalization on both
   - If they match → `pass` with detail showing the canonical path
   - If they differ → `warn` with detail: `"Service binary drift: service uses ${servicePath}, current build is ${buildPath} — run: bun run build && pilot service install && pilot reload"`
   - If `resolvePilotBinary()` throws or service unit doesn't exist → skip the drift check silently (the existing service unit check already warns about missing unit)

**Key design note:** The drift check wraps in try/catch so it never crashes doctor. It's informational. The variable `pilotBinaryPath` from the ExecStart parsing is scoped inside the try block above, so you need to hoist it or re-extract it. The cleanest approach: declare `let serviceExecBinaryPath: string | null = null;` before the existing service unit check, and set it inside that block when the binary path is successfully parsed. Then the drift check reads `serviceExecBinaryPath`.

3. Add tests in `test/commands/doctor.test.ts`:
   - The existing test file already mocks `readFileSync` to return unit content. Add tests for the new drift check.
   - Mock `resolvePilotBinary` (it's imported from service.ts) to return a controlled path.
   - Test pass: service binary matches resolvePilotBinary result
   - Test warn: service binary differs from resolvePilotBinary result
   - Verify warn message contains both paths and the suggested command

**IMPORTANT:** Do NOT restructure the existing doctor checks. Only ADD the new drift check after the existing service unit block. Preserve all existing test behavior.
  </action>
  <verify>
    <automated>bun test test/commands/doctor.test.ts --reporter verbose 2>&1 | tail -30</automated>
  </verify>
  <done>pilot doctor reports a "binary drift" check that warns when the service ExecStart binary differs from resolvePilotBinary(). Tests cover pass, warn, and graceful skip paths.</done>
</task>

<task type="auto">
  <name>Task 2: Create operator runtime documentation</name>
  <files>docs/RUNTIME.md, docs/GETTING-STARTED.md</files>
  <action>
Create `docs/RUNTIME.md` — the comprehensive operator reference for Pilot's runtime/install path unification. This document addresses ALL documentation requirements from the requirements doc.

**Structure for docs/RUNTIME.md:**

```
# Pilot Runtime & Install Path Guide

## The Problem: Split-Brain Runtime
- Brief explanation of what split-brain means (repo build vs service binary can diverge)
- Why this matters (build + restart doesn't always mean new code is running)

## Canonical Binary Path
- Pilot's canonical binary is `<repo>/dist/index.js` (built from `bun run build`)
- `resolvePilotBinary()` resolves via: 1) package root dist/index.js 2) `which pilot` 3) error
- The systemd service unit's ExecStart uses this canonical path (resolved at install time via `realpathSync`)

## Shadow Install Paths (Demoted)
- `~/.local/bin/pilot` — symlink from `bun link` or manual linking. May go stale after rebuilds if not updated.
- `~/.bun/bin/pilot` — bun global install path. May point to an old version.
- fnm/nvm global package path — if pilot was ever npm-installed globally
- **These are NOT the service's runtime path.** They may work for CLI invocations but the service only uses the canonical path from `pilot service install`.

## The Correct Operator Workflow

### Rebuilding Pilot (code changes)
```bash
bun run build        # Compiles to dist/index.js
pilot reload         # Sends SIGHUP → daemon restarts with new code
```

### Full service reinstall (after relinking or path changes)
```bash
bun run build
pilot service install   # Re-generates unit with new canonical path
pilot service start     # Or: systemctl --user restart pilot-runner
```

### Verifying the running service
```bash
pilot doctor    # Look for "service unit" (pass) and "binary drift" (pass)
```

## What Each Command Does

### `pilot update`
Updates the GSD (get-shit-done) commands package and re-runs the GSD installer per registered project. Also updates the OpenClaw skill.
- Does NOT rebuild Pilot itself
- Does NOT restart the service
- Does NOT change the service binary path

### `pilot setup --refresh`
Re-runs project-level setup: re-links symlinks (.opencode/command, .opencode/gsd-tools.cjs, gsd-help.md), merges opencode.json config, and re-offers skills.
- Operates on a TARGET PROJECT, not Pilot itself
- Does NOT rebuild Pilot
- Does NOT affect the service binary

### `pilot service install`
Generates (or regenerates) the systemd user service unit file at `~/.config/systemd/user/pilot-runner.service`. Resolves the canonical pilot binary via `resolvePilotBinary()`, applies `realpathSync()`, and bakes it into ExecStart.
- Run this after any path change (bun link, repo move, etc.)
- Always followed by `pilot service start` or `systemctl --user restart pilot-runner`

### `pilot reload`
Sends SIGHUP to the running daemon. The daemon finishes current work, then exits. systemd auto-restarts it (Restart=always), picking up the new binary at the canonical path.
- This is the HOT-RELOAD path after `bun run build`
- Requires daemon to already be running

### `pilot doctor`
Runs system health checks. Relevant to runtime:
- **service unit**: Checks ExecStart binary exists and is executable
- **binary drift**: Warns if service binary differs from current build output

## Troubleshooting

### "binary drift" warning in pilot doctor
The service unit points to a different binary than your current build. Fix:
```bash
pilot service install && pilot service start
```

### Service not starting after build
Check that dist/index.js exists and is executable:
```bash
ls -la dist/index.js
bun run build   # If missing
```

### Unsure which binary the service runs
```bash
cat ~/.config/systemd/user/pilot-runner.service | grep ExecStart
```
```

**Also update docs/GETTING-STARTED.md:**

In the "Daemon Mode (systemd)" section (around line 678), update the "Hot-reload after build" subsection to add a note:

After the existing `bun run build && pilot reload` line, add a brief note:
```
> **Tip:** Run `pilot doctor` after reload to confirm the service binary matches your build. See [docs/RUNTIME.md](RUNTIME.md) for the full runtime path guide.
```

Keep the change minimal — just add the cross-reference tip. Do NOT restructure the existing content.
  </action>
  <verify>
    <automated>test -f docs/RUNTIME.md && grep -q "canonical" docs/RUNTIME.md && grep -q "shadow" docs/RUNTIME.md && grep -q "pilot update" docs/RUNTIME.md && grep -q "pilot setup --refresh" docs/RUNTIME.md && echo "PASS: RUNTIME.md exists with required sections" || echo "FAIL"</automated>
  </verify>
  <done>docs/RUNTIME.md exists with: root cause explanation, canonical path definition, shadow path documentation, correct operator workflow, command clarifications (update vs setup --refresh vs service install vs reload vs doctor), and troubleshooting section. GETTING-STARTED.md cross-references it.</done>
</task>

</tasks>

<verification>
1. `bun test test/commands/doctor.test.ts` — all tests pass including new drift detection tests
2. `bun test test/commands/service.test.ts` — existing service tests still pass (no regressions)
3. `docs/RUNTIME.md` exists with all required sections
4. `docs/GETTING-STARTED.md` cross-references RUNTIME.md
5. Full test suite: `bun test` — no regressions
</verification>

<success_criteria>
- pilot doctor reports "binary drift" check (pass when paths match, warn when they differ)
- docs/RUNTIME.md comprehensively documents: root cause, canonical path, shadow paths, operator workflow, command clarifications, troubleshooting
- All existing tests pass with no regressions
- An operator reading docs/RUNTIME.md can understand and follow the correct rebuild/update workflow without tribal knowledge
</success_criteria>

<output>
After completion, create `.planning/quick/260321-vga-pilot-runtime-install-path-unification-o/260321-vga-SUMMARY.md`
</output>
