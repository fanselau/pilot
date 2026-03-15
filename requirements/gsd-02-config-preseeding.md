# GSD Config Pre-seeding for Autonomous Execution

## Problem
GSD defaults to `mode: "interactive"` which blocks on every phase transition waiting for user confirmation. Without pre-seeding `.planning/config.json`, Pilot's headless sessions will hang indefinitely.

## Goal
During `pilot setup`, write `.planning/config.json` with optimal autonomous config. GSD reads this on every command invocation.

## Requirements

### Must Have

- [ ] After the GSD installer runs in `pilot setup`, create `.planning/` directory if it doesn't exist
- [ ] Write `.planning/config.json` with:
  ```json
  {
    "mode": "yolo",
    "granularity": "standard",
    "parallelization": true,
    "commit_docs": true,
    "model_profile": "balanced",
    "planning": { "commit_docs": true, "search_gitignored": false },
    "git": { "branching_strategy": "none" },
    "workflow": {
      "research": true,
      "plan_check": true,
      "verifier": true,
      "auto_advance": true,
      "nyquist_validation": true,
      "ui_phase": true,
      "ui_safety_gate": false,
      "node_repair": true,
      "node_repair_budget": 2
    }
  }
  ```
- [ ] If `.planning/config.json` already exists, MERGE Pilot's keys — don't overwrite user customizations. Use deep merge (Pilot keys win on conflict for critical keys like `mode`, user keys preserved for everything else).
- [ ] `mode: "yolo"` — skips all confirmation prompts. CRITICAL for headless execution.
- [ ] `auto_advance: true` — REQUIRED for auto-approving checkpoints (human-verify, decision) within execute-phase. Pilot uses `--no-transition` on execute-phase to prevent GSD from advancing to the NEXT phase. These two work together: `auto_advance` handles within-phase automation, `--no-transition` prevents cross-phase automation.
- [ ] `node_repair: true` + `node_repair_budget: 2` — GSD retries failed tasks before escalating.
- [ ] `ui_phase: true` — enables UI design contract generation. `ui_safety_gate: false` — disables the blocking "run ui-phase first?" prompt in plan-phase. Pilot explicitly runs `gsd-ui-phase N` before plan-phase for frontend phases, so UI-SPEC.md exists when plan-phase checks. Non-frontend phases simply won't trigger UI checks (GSD detects frontend indicators).
- [ ] `nyquist_validation: true` — Nyquist creates VALIDATION.md during research (step 5.5). The step 7.5 gate only fires if VALIDATION.md is missing after research — rare with `research: true`. Keep enabled for quality.
- [ ] `model_profile: "balanced"` — planner=Opus-tier (inherits parent model), executor/researcher/verifier=Sonnet.

### Nice to Have
- [ ] `pilot config <project> set <key> <value>` CLI for editing GSD config per project
- [ ] `pilot setup --granularity coarse|standard|fine` flag

## Technical Notes
- `mode: "yolo"` is the documented autonomous mode — skips confirmations, auto-proceeds
- `auto_advance` is persistent config. `_auto_chain_active` is ephemeral (set by `--auto`). They're different — Pilot should NOT set `auto_advance: true`.
- Config is read by `gsd-tools.cjs init` at the start of every GSD command invocation
- See `gsd-upstream-reference.md` for full config key documentation

## Do NOT
- Do NOT set `mode: "interactive"` — causes hangs
- Do NOT set `auto_advance: false` — without it, execute-phase checkpoints (human-verify, decision) block waiting for user input. Use `--no-transition` to prevent cross-phase chaining instead.
- Do NOT set `ui_safety_gate: true` globally — blocks backend projects unexpectedly

#### Config Lifecycle (CRITICAL — from critique)

- [ ] Remove contradicting sentence from Technical Notes: "Pilot should NOT set `auto_advance: true`" — this is stale. `auto_advance: true` is correct and required.
- [ ] Define PILOT_WINS keys explicitly: `mode`, `auto_advance`, `workflow.node_repair`, `workflow.ui_safety_gate`. These are always overwritten to safe values. All other keys use user's value if present.
- [ ] Deep merge = merge at each object level. For nested objects (workflow, planning, git), merge key-by-key. PILOT_WINS keys always take Pilot's value.
- [ ] `gsd-new-project --auto` may recreate `.planning/` — runner MUST re-apply config after `runInitProject()` completes. Add this as a coordination requirement with gsd-04.
- [ ] Pre-job config assertion: before spawning any GSD command, runner checks `.planning/config.json` exists and contains `mode: "yolo"` + `auto_advance: true`. If missing or wrong, re-apply config.
- [ ] Atomic config writes: write to `.planning/config.json.tmp` then rename. Prevents partial reads.
- [ ] Per-job config patching (ui_phase toggle): use file locking or accept that concurrent same-project jobs are not supported (document constraint).
