# Extend gsd-verifier with Automated Build Checks + Runner Integration

## Problem

The gsd-verifier agent already does excellent goal-backward verification (truths → artifacts → wiring → browser testing). But it has two gaps:

1. **No automated build checks** — it does grep/code analysis but never runs `tsc`, tests, lint, or build. These catch ~80% of broken phases instantly.
2. **No machine-readable verdict for runner** — outputs markdown VERIFICATION.md but the pilot runner needs structured JSON to decide pass/fail/retry.

The current pilot-judge is separate and weak — it reads session transcripts and gives unstructured opinions. We should replace it with the gsd-verifier (which actually reads code) plus automated checks.

## Goal

Extend the existing gsd-verifier to run automated checks first, then do its existing verification, and output a structured verdict the runner can parse.

## Requirements

### Must Have

- [ ] **Add Step 0.5 to gsd-verifier: Automated Build Checks**
  Run before any code analysis. Fail fast — if these fail, skip the rest.
  
  Checks (in order):
  1. `tsc --noEmit` — TypeScript compilation (~10s)
  2. Lint if configured — `eslint --no-warn` errors only (~5s)  
  3. Test runner — `vitest run --reporter=json` or equivalent (~15s)
  4. Build — project's build command from package.json (~20s)
  
  **Project-aware detection:**
  - Has `tsconfig.json` → run tsc
  - Has vitest/jest in dependencies → run tests
  - Has eslint config → run lint
  - Has `build` script in package.json → run build
  - Skip unavailable checks gracefully

- [ ] **Add structured JSON summary to VERIFICATION.md frontmatter**
  Extend the existing YAML frontmatter with machine-readable results:
  ```yaml
  ---
  phase: XX-name
  status: passed | gaps_found | failed
  score: N/M
  automated_checks:
    typescript: { pass: true, duration_ms: 8200 }
    lint: { pass: true, duration_ms: 5100 }
    tests: { pass: true, summary: "14 passed", duration_ms: 12400 }
    build: { pass: true, duration_ms: 18600 }
  verdict: PASS | FAIL | WARN
  blocking_issues: []
  ---
  ```

- [ ] **Update pilot runner to use gsd-verifier instead of pilot-judge**
  After execute-phase completes:
  1. Run `gsd-verify-phase <N>` (which invokes gsd-verifier)
  2. Parse VERIFICATION.md frontmatter for structured verdict
  3. Decision logic:
     - `automated_checks` any fail → auto-fail, retry with error output
     - `status: passed` → mark phase complete
     - `status: gaps_found` → retry with gaps as context, or pause
     - `status: human_needed` → pause for human review

- [ ] **Create `gsd-verify-phase` command** (thin wrapper)
  A GSD command that:
  1. Determines the phase directory from args
  2. Spawns gsd-verifier agent with the phase context
  3. Returns the verdict

### Nice to Have

- [ ] Extend verification to quick-scope jobs (run automated checks after quick completes)
- [ ] `--skip-verify` flag on pilot to bypass verification when needed
- [ ] Timeout per check (tsc: 60s, tests: 120s, build: 120s)

## Technical Notes

- gsd-verifier agent already exists at `.opencode/agents/gsd-verifier.md` in both pilot and pilot-gsd
- The verifier already has Steps 0-10 covering goal verification, artifact checks, wiring, browser testing, gap analysis
- New automated checks go BEFORE Step 1 (fail fast before expensive code analysis)
- pilot-judge command in pilot's `.opencode/command/` can be replaced or kept as fallback
- The verify command goes in pilot-gsd (GSD workflow), runner integration in pilot

## Files to Modify

**pilot-gsd:**
- `.opencode/agents/gsd-verifier.md` — add Step 0.5 automated checks + JSON frontmatter
- `.opencode/command/gsd-verify-phase.md` — new command (thin wrapper)

**pilot:**
- `src/core/runner.ts` — replace pilot-judge invocation with gsd-verify-phase + VERIFICATION.md parsing
- `.opencode/command/pilot-judge.md` — deprecate or remove

## Do NOT

- Create a separate verification system — extend the existing gsd-verifier
- Remove the existing goal-backward verification — automated checks are additive
- Make verification blocking without escape — always allow `--skip-verify`
- Run the full verifier for quick tasks — just automated checks (tsc/test/build)
