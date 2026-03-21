# Phase 85: Pilot CLI: Disable Milestones for Now + Realign Top-Level GSD Commands (debug + fast) - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning
**Source:** PRD Express Path (requirements/pilot-disable-milestones-and-add-debug-job-type.md)

<domain>
## Phase Boundary

This phase makes Pilot safer and more expressive at the CLI level by:

1. **Disabling milestone queuing** — prevent users/agents from entering the broken milestone path via normal CLI. Keep internals intact for later re-enablement.
2. **Adding first-class `debug` job scope** — `pilot add <project> <desc> --as debug` maps onto GSD's `gsd-debug` (diagnose-issues) workflow.
3. **Adding first-class `fast` job scope** — `pilot add <project> <desc> --as fast` for truly trivial inline tasks, skipping heavier planning.
4. **Autonomy checks** — explicit agent/operator guidance for workflow-selection so agents choose debug/fast/quick/phase correctly.
5. **GSD command surface alignment** — ensure the local GSD clone has `diagnose-issues.md` (already exists as `/gsd-debug`) and a fast workflow (needs creation or mapping).

</domain>

<decisions>
## Implementation Decisions

### Milestone Blocking
- Milestone scope MUST be blocked at the CLI layer — `pilot add --as milestone` rejected with clear error explaining milestones are disabled
- Auto-detection of directory inputs MUST NOT auto-select milestone scope — fallback to `phase` instead
- Milestone internals (milestone.ts command, runner milestone coordinator, DB schema) MUST NOT be ripped out
- `pilot milestone status/resume/skip` subcommands can remain but milestone queuing is blocked
- `defaults.scope` config MUST reject 'milestone' value during add
- Help text MUST explain why milestone is disabled

### Debug Scope
- Add `'debug'` to `JobScope` type union: `'quick' | 'phase' | 'milestone' | 'debug' | 'fast'`
- `pilot add <project> <desc> --as debug` queues a debug job
- Debug jobs accept structured input: issue summary, expected behavior, actual behavior, errors/symptoms
- Debug jobs map to GSD `diagnose-issues` workflow via `--command gsd-debug` in `spawnAndWait`
- Debug jobs use `_top:quick` model scope (same as quick — debugging is single-session work)
- Delegation AI: `'debug'` intent type outputs `{ type: 'debug', description, symptoms? }`
- Runner `intentToSteps`: `case 'debug'` → `[{ command: 'debug', args: description }]` which maps to `gsd-debug` via spawnAndWait
- No auto-detection for debug — always explicit `--as debug`

### Fast Scope
- Add `'fast'` to `JobScope` type union
- `pilot add <project> <desc> --as fast` queues a fast job
- Fast jobs are for truly trivial inline work — skip heavier planning
- Fast maps to GSD `gsd-quick` with no flags (no --full, no --research) — the lightest possible path
- Fast jobs use `_top:quick` model scope
- Delegation AI: `'fast'` intent type outputs `{ type: 'fast', description }`
- Runner `intentToSteps`: `case 'fast'` → `[{ command: 'quick', args: description }]` — same as quick but WITHOUT the optional flags
- Auto-detection: never — always explicit `--as fast`

### Autonomy Checks
- Update delegation prompt (`src/prompts/delegate.md`) with explicit decision tree for mode selection
- debug: for runtime failures, broken behavior, diagnosis-first work
- fast: for trivial inline work that should skip heavier planning
- quick: for small self-contained tasks that need a planner but no phase overhead
- phase: for requirement-file-driven work that needs full planning
- Make these distinctions explicit enough that AI callers don't improvise

### CLI Help
- `--as` option text updated to include debug and fast
- Help text explains when to use each scope

### Claude's Discretion
- Implementation details of fast workflow GSD mapping (use `gsd-quick` without flags is simplest)
- Exact wording of milestone-disabled error message
- Whether to add `_top:debug` and `_top:fast` model scope entries or reuse `_top:quick` for both
- Debug job input structure (keep it simple — just pass description, let gsd-debug handle symptom gathering)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pilot Core Types
- `src/core/types.ts` — JobScope type, DelegationIntent union, Job interface, ConfigFileSchema
- `src/core/models.ts` — AGENT_MODELS table, resolveTopLevelModel scope-to-key mapping

### CLI and Routing
- `src/commands/add.ts` — detectScope(), addCommand(), AddOptions, --as flag handling
- `src/index.ts` — CLI registration, --as option, help text
- `src/core/delegate.ts` — delegation AI, intentToSteps (in runner.ts), parseIntentOutput validation
- `src/core/runner.ts` — intentToSteps() at line 892, spawnAndWait() at line 1535, executeCommandStep

### Delegation Prompt
- `src/prompts/delegate.md` — delegation AI decision tree, intent schema, autonomy guidance

### GSD Workflows
- `.opencode/get-shit-done/workflows/diagnose-issues.md` — GSD debug workflow (gsd-debug)
- `.opencode/get-shit-done/workflows/quick.md` — GSD quick workflow (gsd-quick)
- `.opencode/get-shit-done/workflows/help.md` — GSD command listing and descriptions

### Config
- `src/commands/config.ts` — defaults.scope enum validation

</canonical_refs>

<specifics>
## Specific Ideas

- `spawnAndWait` already prepends `gsd-` to commands — so `command: 'debug'` becomes `--command gsd-debug` automatically
- `resolveTopLevelModel` maps `scope === 'milestone'` to `_top:phase` — map `debug` and `fast` to `_top:quick`
- `detectScopeWithReason` currently returns 'milestone' for directories — change to 'phase' with note about milestone being disabled
- Delegation prompt needs a new section on debug/fast intent types and when to use them
- The `validTypes` array in `parseIntentOutput` needs `'debug'` and `'fast'` added

</specifics>

<deferred>
## Deferred Ideas

- Re-enabling milestone scope in the future (explicitly called out as "leave in re-enableable state")
- Regression coverage around workflow selection (nice-to-have)
- Improving `pilot add --help` examples (nice-to-have)
- Debug session resume/continue when there's an active debug session for the same issue

</deferred>

---

*Phase: 85-pilot-cli-disable-milestones-for-now-realign-top-level-gsd-commands-debug-fast*
*Context gathered: 2026-03-21 via PRD Express Path*
