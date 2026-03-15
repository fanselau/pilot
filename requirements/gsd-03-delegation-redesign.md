# Delegation Pipeline Redesign — Intent-Based Architecture

## Problem
The current delegation model outputs exact step sequences (`{ steps: [{ command, args }] }`), the runner loops through them sequentially, and special cases are hardcoded (`if command === 'execute-phase'` → run judge, `if command === 'new-milestone'` → re-delegate). This is fragile and doesn't scale with upstream GSD's richer command set, auto-retry, or milestone lifecycle.

## Goal
Replace step-based delegation with intent-based delegation. The delegation AI outputs a single **intent** with metadata. The runner owns the workflow logic for each intent type.

## Requirements

### Must Have

#### New DelegationIntent Type

- [ ] Replace `DelegationStep` and `DelegationPlan` in `src/core/types.ts` with:
  ```typescript
  type DelegationIntent =
    | { type: 'quick'; description: string; flags?: ('full' | 'research')[] }
    | { type: 'init-project'; prdPath: string }
    | { type: 'new-milestone'; prdPath: string }
    | { type: 'plan-and-execute'; phaseNumber: number; prdPath?: string; isGapClosure?: boolean; addPhaseTitle?: string }
    | { type: 'execute-only'; phaseNumber: number }
    | { type: 'audit-milestone'; version: string }
    | { type: 'complete-milestone'; version: string }
    | { type: 'noop'; reason: string }

  interface DelegationResult {
    intent: DelegationIntent;
    reasoning: string;
  }
  ```
- [ ] Update all code that references `DelegationStep[]` or `DelegationPlan`

#### Delegation AI Prompt — Complete Rewrite

- [ ] Move delegation prompt from pilot-gsd's `commands/gsd-delegate.md` to Pilot's `src/prompts/delegate.md`
- [ ] Update `delegate.ts` to load prompt from `src/prompts/delegate.md` and pass directly to opencode session (not `--command gsd-delegate`)
- [ ] The delegation AI reads project state and outputs ONE intent as a JSON block
- [ ] Decision tree for the delegation AI:
  - No `.planning/` directory → `{ type: 'init-project', prdPath }`
  - Milestone scope + no phases in roadmap → `{ type: 'new-milestone', prdPath }`
  - Quick scope → `{ type: 'quick', description, flags }` (flags: `full` for quality-critical, `research` for unfamiliar domains)
  - No matching phase in roadmap → `{ type: 'plan-and-execute', phaseNumber: <next>, prdPath, addPhaseTitle: "<title>" }`
  - Phase exists, no plans → `{ type: 'plan-and-execute', phaseNumber: N, prdPath }`
  - Phase exists, plans exist but execution incomplete → `{ type: 'execute-only', phaseNumber: N }`
  - Phase complete → `{ type: 'noop', reason: 'Phase N already complete' }`
  - All phases complete, milestone scope → `{ type: 'audit-milestone', version }`
- [ ] Gap retry intent is NOT produced by the delegation AI — it's produced by the runner when judge fails. The runner creates `{ type: 'plan-and-execute', phaseNumber: N, isGapClosure: true }` internally.
- [ ] The prompt only needs `read`, `glob`, `grep` tools — it reads project state, nothing more
- [ ] Remove `GSD_INSTRUCTION_BLOCKLIST` — with intent-based output, the AI never produces raw command strings

#### Parsing and Validation

- [ ] `waitForDelegationResult()` in delegate.ts: parse the JSON output, validate it matches one of the `DelegationIntent` union types
- [ ] On parse failure: retry delegation once, then fail the job
- [ ] Log the `reasoning` field for debugging but don't act on it

## Technical Notes
- The delegation AI is a cheap, fast session — it only reads files and outputs JSON
- One intent per delegation call. The runner may call delegation multiple times (e.g., after init-project or new-milestone)
- The prompt should reference GSD's state files: `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/phases/*/`
- Phase numbers are read from ROADMAP.md: `### Phase N: Title` format
- Requirement file heading (`# Title`) is used for `addPhaseTitle`
- See `research/delegation-redesign-2026-03-15.md` for full design rationale

## Do NOT
- Do NOT output GSD command strings from the delegation AI — that's the runner's job
- Do NOT have the delegation AI decide retry/gap logic — that's the runner's job after judge
- Do NOT have the delegation AI output multi-step sequences — one intent only
- Do NOT call `gsd-delegate` as a GSD command anymore — it's a Pilot-internal prompt

#### Critical Fixes (from critique)

- [ ] After `add-phase` completes, runner MUST re-read ROADMAP.md to get the actual created phase number — do NOT rely on the delegation-predicted `phaseNumber`. The runner updates the intent's `phaseNumber` before proceeding to plan-phase.
- [ ] Milestone loop: the runner calls `delegate()` in a loop after each phase completes. Loop terminates when delegation returns `noop` or `audit-milestone`. Max re-delegation depth: 3 per intent type (prevents init-project → init-project loops).
- [ ] `complete-milestone` is runner-internal only — remove from delegation AI's output options. Runner emits it internally after audit passes.
- [ ] Pass retry context to delegation: `retry_context: ${job.retryHint ?? 'none'}` and `attempt: ${job.retryCount}` in the prompt args.
- [ ] Milestone scope + no `.planning/` → `init-project` (not `new-milestone`). Add this branch to decision tree.
- [ ] `DelegationResult` JSON format must be shown explicitly in the prompt with examples (like the current prompt does).
- [ ] Parse failure retry: inject "Your previous attempt produced invalid JSON: `<error>`" into the second attempt's prompt.
- [ ] Milestone version: delegation AI reads from STATE.md `current_milestone` field or ROADMAP.md heading. Specify this source.
- [ ] `setup-agents` and `lessons` — either add to intent type or explicitly document they're removed (gsd-09 removes them).
