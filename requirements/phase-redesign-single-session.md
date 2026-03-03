# Phase Redesign: Single-Session Orchestrator + Judge

## Problem
Phase mode has ~36% success rate. The runner chains 4 separate opencode sessions (add-phase → plan-phase → execute-phase → verify-phase) and tries to evaluate each with heuristic regex matching and artifact checks. This fails because:
- 4 AIs playing telephone through a wall of heuristics
- No structured completion contract
- Runner guesses success from natural language
- Each inter-session handoff is a point of failure

Quick mode (1 session) works reliably. Phase mode should work the same way.

## Goal
Phase mode works as reliably as quick mode. Runner spawns one session, waits for it, evaluates with a judge.

## Design

### Part 1: `gsd-phase` Command

A new GSD command at `.opencode/command/gsd-phase.md` that orchestrates the full phase lifecycle in ONE session by calling existing GSD commands as subagents via Task().

**What it does:**
1. Read the requirement (from `@path` argument or inline description)
2. Read `.planning/STATE.md` and `.planning/ROADMAP.md` for context
3. Check if phase already exists for this requirement (resume case)
4. If no phase exists: call `/gsd-add-phase` via Task() to create it
5. Check if plans exist. If not: call `/gsd-plan-phase --auto` via Task()
6. Call `/gsd-execute-phase` via Task() to execute all plans

**Key behaviors:**
- If add-phase subagent fails → retry once, then report failure in final message
- If plan-phase subagent fails → retry once, then report failure in final message
- If execute-phase subagent fails → report what was accomplished and what failed in final message
- If `--phase N` flag provided → skip add-phase, go straight to plan/execute for phase N
- If `--resume` flag provided → skip add-phase and plan-phase, check which plans have SUMMARY.md, execute only remaining plans
- The orchestrator stays LEAN — it reads frontmatter/titles only, not full file contents. Subagents do the heavy lifting in their own context windows.

**Context window management:**
- The orchestrator delegates ALL heavy work (code reading, editing, testing) to subagents
- Orchestrator context ≈ 20-30k tokens (requirement + project state + subagent result summaries)
- Each subagent (add-phase, plan-phase, execute-phase) gets its own fresh 200k context
- execute-phase internally spawns executor subagents per plan (existing wave-based parallelism)
- This means: orchestrator → execute-phase → executors = 3 levels of nesting, each with fresh context
- Hard cap: if phase has >6 plans, the orchestrator should split into two execute-phase calls (plans 1-3, then plans 4-6)

**Arguments:**
- `@<requirement-path>` — path to requirement file
- `"<description>"` — inline description (for continue-existing-phase)
- `--phase N` — explicit phase number (skip add-phase)
- `--resume` — skip planning, execute only plans without SUMMARY.md
- `--auto` — unattended mode (no user prompts)

### Part 2: `pilot-judge` Command

A new GSD command at `.opencode/command/pilot-judge.md` that evaluates whether a phase job succeeded. Runs as a separate opencode session with a cheap model (haiku).

**Input (passed as arguments):**
- Path to the requirement file
- Session title of the phase session (so it can read transcript from opencode DB)

**What it does:**
1. Read the requirement file
2. Query the opencode DB for the session transcript (tool calls, errors, patches, final message)
3. Evaluate: did the session accomplish the requirement?
4. Output a structured JSON verdict

**Verdict schema:**
```json
{
  "verdict": "pass|fail|partial",
  "confidence": 0.85,
  "summary": "Human-readable summary for TUI/PR/Telegram",
  "prDescription": "PR description in markdown",
  "commitMessage": "conventional commit message",
  "retryRecommendation": "none|retry-full|retry-resume",
  "retryHint": "Resume from plan 03"
}
```

**Model:** haiku (cheap, fast, good at structured output). Configured via opencode agent model override.

**Context window:** The judge session is small — requirement (~5k) + condensed transcript (~20-30k) = well under 200k.

### Part 3: Runner Simplification

**delegate.ts changes:**
- For phase scope: generate ONE step `{ command: 'phase', args: buildPhaseArgs(job) }` instead of 3-4 steps
- For bare-number descriptions (e.g., "25"): `{ command: 'phase', args: '--phase 25 --auto' }`
- For requirement files: `{ command: 'phase', args: '@requirements/feature.md --auto' }`
- Delegation AI is SKIPPED for phase jobs — always use deterministic fallback (the gsd-phase command handles all the intelligence)

**runner.ts changes:**
- After session completes (isSessionDone), spawn judge
- Spawn judge session: `opencode run --command pilot-judge <args>`
- Wait for judge to complete (same spawnAndWait)
- Parse judge verdict
- If pass → markCompleted, store summary/PR description
- If partial + retryable → resetToPending with resume hint
- If fail + retryable → resetToPending
- If fail + not retryable → markFailed

**What gets deleted from runner.ts:**
- `evaluateStepResult()` — replaced by judge
- `verifyStepArtifacts()` — replaced by judge
- `verifyWithGraceWindow()` — replaced by judge
- `patchStepArgs()` — single step, no patching
- `scanPhaseDirs()` — only used by verifyStepArtifacts
- All inter-step artifact check logic in the launch() loop
- The multi-step loop in launch() simplifies to: spawn phase → spawn judge → decide

**New DB additions:**
- `resume_hint TEXT` column on jobs table
- `judge_verdict TEXT` column on jobs table (stores JSON)
- `resetToPending(jobId, resumeHint?)` function

### Part 4: Milestone Mode

Runner-level decomposition, no AI needed:
- If requirement path is a directory → list .md files → create one phase job per file with `depends_on` chaining
- Each phase job uses gsd-phase command independently
- Original milestone job marked completed after spawning children

## Requirements

### Must Have
- [ ] `gsd-phase.md` command that orchestrates add→plan→execute via subagent Task() calls
- [ ] `pilot-judge.md` command that evaluates phase results using opencode DB transcript
- [ ] `pilot-judge` reads from opencode DB (not heuristic artifact/regex checks)
- [ ] `pilot-judge` runs as opencode session with haiku model
- [ ] delegate.ts generates single step for phase jobs
- [ ] runner.ts spawns judge after phase session completes
- [ ] runner.ts uses judge verdict to decide complete/retry/fail
- [ ] `resetToPending()` for retryable failures + shutdown resilience
- [ ] Shutdown handler resets interrupted jobs to pending (not failed)
- [ ] Delete evaluateStepResult, verifyStepArtifacts, verifyWithGraceWindow
- [ ] Milestone jobs decomposed into chained phase jobs at runner level

### Nice to Have
- [ ] Judge produces PR description + commit message for TUI/notifications
- [ ] Session monitor polls opencode DB for live TUI activity feed
- [ ] `--resume` flag support in gsd-phase

## Technical Notes
- gsd-phase orchestrator should stay under 30k tokens — ALL heavy work delegated to subagents
- execute-phase already handles wave-based parallel execution with subagent executors
- The 3-level nesting (gsd-phase → execute-phase → executors) keeps each level in its own context
- Judge session should complete in <30 seconds with haiku
- No result.json — judge reads everything from opencode DB directly

## Do NOT
- Use direct API calls — everything through opencode
- Add custom timeout handling — opencode manages session lifecycle
- Kill sessions from the runner — let opencode handle it
- Inline subagent results into the orchestrator context — stay lean, read summaries only
- Make the judge a long-running session — it's a quick evaluation, should be fast
