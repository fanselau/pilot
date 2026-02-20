# pilot-gsd Fork Requirements

**Repo:** `lucafanselau/pilot-gsd` at `~/dev/pilot-gsd/`  
**Upstream:** `gsd-build/get-shit-done` (v1.20.5)  
**Date:** 2026-02-20  
**Purpose:** Make GSD fully autonomous for Pilot CLI — zero interactivity, explicit model assignment, opencode-native frontmatter.

---

## Philosophy

This fork assumes **no human is watching**. Every `AskUserQuestion` call is a potential stdin hang (Category A stuck — 50% of all incidents). If someone wants interactive GSD, they use upstream.

**What we preserve:** The phased approach (plan → execute → verify), requirement-driven development, atomic commits, gap closure loops, checkpoint protocols, wave-based parallelization. We only change HOW agents are configured and WHAT happens at decision points.

**Install model:** Pilot CLI (`pilot setup`) symlinks from this repo into project `.opencode/` directories. Per-project, not global. All `@` path references must use `@./.opencode/...` (relative to project root).

---

## Do NOT Change

- Core plan/execute/verify logic in any workflow
- PLAN.md / SUMMARY.md / STATE.md / ROADMAP.md file formats
- Atomic commit patterns and git integration
- Wave-based parallel execution in execute-phase
- Checkpoint type definitions (human-verify, decision, human-action)
- Auto-mode checkpoint handling in execute-phase.md (already works: human-verify auto-approves, decision auto-selects first option)
- gsd-tools.cjs functionality
- Research → Plan → Check → Execute → Verify pipeline structure
- discuss-phase.md (interactive by design, not in autonomous pipeline)
- verify-phase.md / verify-work.md (verify-auto is used instead)
- Agent role definitions, instructions, and behavior (only frontmatter changes)

---

## 1. Agent Frontmatter — All 11 Files

**Location:** `agents/*.md`

Every agent needs: remove `name:` field, change `tools:` from comma-separated string to object format, add `model:` field, change `color:` from name to hex.

### Format Reference (from working smashkit agents)

```yaml
---
description: ...
model: anthropic/claude-opus-4-6
color: "#FFFF00"
tools:
  read: true
  write: true
  edit: true
  bash: true
---
```

Key differences from current fork format:
- **No `name:` field** — opencode derives name from filename
- **`tools:` as object** not `tools: Read, Bash, Write` string
- **`model:` field** — explicit model assignment
- **`color:` as hex** not color name

### File-by-File Changes

#### `agents/gsd-executor.md`
**Before:**
```yaml
---
name: gsd-executor
description: Executes GSD plans with atomic commits, deviation handling, checkpoint protocols, and state management. Spawned by execute-phase orchestrator or execute-plan command.
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow
---
```
**After:**
```yaml
---
description: Executes GSD plans with atomic commits, deviation handling, checkpoint protocols, and state management. Spawned by execute-phase orchestrator or execute-plan command.
model: anthropic/claude-opus-4-6
color: "#FFFF00"
tools:
  read: true
  write: true
  edit: true
  bash: true
  grep: true
  glob: true
---
```

#### `agents/gsd-planner.md`
**Before:**
```yaml
---
name: gsd-planner
description: Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification. Spawned by /gsd:plan-phase orchestrator.
tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__context7__*
color: green
---
```
**After:**
```yaml
---
description: Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification. Spawned by /gsd-plan-phase orchestrator.
model: anthropic/claude-opus-4-6
color: "#00FF00"
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
  webfetch: true
  mcp__context7__*: true
---
```

#### `agents/gsd-phase-researcher.md`
**Before:**
```yaml
---
name: gsd-phase-researcher
description: Researches how to implement a phase before planning. Produces RESEARCH.md consumed by gsd-planner. Spawned by /gsd:plan-phase orchestrator.
tools: Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp__context7__*
color: cyan
---
```
**After:**
```yaml
---
description: Researches how to implement a phase before planning. Produces RESEARCH.md consumed by gsd-planner. Spawned by /gsd-plan-phase orchestrator.
model: anthropic/claude-opus-4-6
color: "#00FFFF"
tools:
  read: true
  write: true
  bash: true
  grep: true
  glob: true
  websearch: true
  webfetch: true
  mcp__context7__*: true
---
```

#### `agents/gsd-project-researcher.md`
**Before:**
```yaml
---
name: gsd-project-researcher
description: Researches domain ecosystem before roadmap creation. Produces files in .planning/research/ consumed during roadmap creation. Spawned by /gsd:new-project or /gsd:new-milestone orchestrators.
tools: Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp__context7__*
color: cyan
---
```
**After:**
```yaml
---
description: Researches domain ecosystem before roadmap creation. Produces files in .planning/research/ consumed during roadmap creation. Spawned by /gsd-new-project or /gsd-new-milestone orchestrators.
model: anthropic/claude-opus-4-6
color: "#00FFFF"
tools:
  read: true
  write: true
  bash: true
  grep: true
  glob: true
  websearch: true
  webfetch: true
  mcp__context7__*: true
---
```

#### `agents/gsd-roadmapper.md`
**Before:**
```yaml
---
name: gsd-roadmapper
description: Creates project roadmaps with phase breakdown, requirement mapping, success criteria derivation, and coverage validation. Spawned by /gsd:new-project orchestrator.
tools: Read, Write, Bash, Glob, Grep
color: purple
---
```
**After:**
```yaml
---
description: Creates project roadmaps with phase breakdown, requirement mapping, success criteria derivation, and coverage validation. Spawned by /gsd-new-project orchestrator.
model: anthropic/claude-opus-4-6
color: "#800080"
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
---
```

#### `agents/gsd-debugger.md`
**Before:**
```yaml
---
name: gsd-debugger
description: Investigates bugs using scientific method, manages debug sessions, handles checkpoints. Spawned by /gsd:debug orchestrator.
tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch
color: orange
---
```
**After:**
```yaml
---
description: Investigates bugs using scientific method, manages debug sessions, handles checkpoints. Spawned by /gsd-debug orchestrator.
model: anthropic/claude-opus-4-6
color: "#FFA500"
tools:
  read: true
  write: true
  edit: true
  bash: true
  grep: true
  glob: true
  websearch: true
---
```

#### `agents/gsd-plan-checker.md`
**Before:**
```yaml
---
name: gsd-plan-checker
description: Verifies plans will achieve phase goal before execution. Goal-backward analysis of plan quality. Spawned by /gsd:plan-phase orchestrator.
tools: Read, Bash, Glob, Grep
color: green
---
```
**After:**
```yaml
---
description: Verifies plans will achieve phase goal before execution. Goal-backward analysis of plan quality. Spawned by /gsd-plan-phase orchestrator.
model: anthropic/claude-sonnet-4-6
color: "#00FF00"
tools:
  read: true
  bash: true
  glob: true
  grep: true
---
```

#### `agents/gsd-verifier.md`
**Before:**
```yaml
---
name: gsd-verifier
description: Verifies phase goal achievement through goal-backward analysis. Checks codebase delivers what phase promised, not just that tasks completed. Creates VERIFICATION.md report.
tools: Read, Write, Bash, Grep, Glob
color: green
---
```
**After:**
```yaml
---
description: Verifies phase goal achievement through goal-backward analysis. Checks codebase delivers what phase promised, not just that tasks completed. Creates VERIFICATION.md report.
model: anthropic/claude-sonnet-4-6
color: "#00FF00"
tools:
  read: true
  write: true
  bash: true
  grep: true
  glob: true
---
```

#### `agents/gsd-integration-checker.md`
**Before:**
```yaml
---
name: gsd-integration-checker
description: Verifies cross-phase integration and E2E flows. Checks that phases connect properly and user workflows complete end-to-end.
tools: Read, Bash, Grep, Glob
color: blue
---
```
**After:**
```yaml
---
description: Verifies cross-phase integration and E2E flows. Checks that phases connect properly and user workflows complete end-to-end.
model: anthropic/claude-sonnet-4-6
color: "#0000FF"
tools:
  read: true
  bash: true
  grep: true
  glob: true
---
```

#### `agents/gsd-research-synthesizer.md`
**Before:**
```yaml
---
name: gsd-research-synthesizer
description: Synthesizes research outputs from parallel researcher agents into SUMMARY.md. Spawned by /gsd:new-project after 4 researcher agents complete.
tools: Read, Write, Bash
color: purple
---
```
**After:**
```yaml
---
description: Synthesizes research outputs from parallel researcher agents into SUMMARY.md. Spawned by /gsd-new-project after 4 researcher agents complete.
model: anthropic/claude-sonnet-4-6
color: "#800080"
tools:
  read: true
  write: true
  bash: true
---
```

#### `agents/gsd-codebase-mapper.md`
**Before:**
```yaml
---
name: gsd-codebase-mapper
description: Explores codebase and writes structured analysis documents. Spawned by map-codebase with a focus area (tech, arch, quality, concerns). Writes documents directly to reduce orchestrator context load.
tools: Read, Bash, Grep, Glob, Write
color: cyan
---
```
**After:**
```yaml
---
description: Explores codebase and writes structured analysis documents. Spawned by map-codebase with a focus area (tech, arch, quality, concerns). Writes documents directly to reduce orchestrator context load.
model: anthropic/claude-sonnet-4-6
color: "#00FFFF"
tools:
  read: true
  bash: true
  grep: true
  glob: true
  write: true
---
```

### Model Assignment Rationale

| Model | Agents | Why |
|-------|--------|-----|
| `anthropic/claude-opus-4-6` | executor, planner, phase-researcher, project-researcher, roadmapper, debugger | These write code, make architecture decisions, or do deep research. Need best reasoning. |
| `anthropic/claude-sonnet-4-6` | plan-checker, verifier, integration-checker, research-synthesizer, codebase-mapper | Verification, checking, summarization, analysis. Important but follows structured patterns. |

### Body Text Changes in All Agents

In every agent file body, replace slash command syntax:
- `/gsd:command` → `/gsd-command` (opencode uses hyphens, not colons)

Example: `/gsd:plan-phase` → `/gsd-plan-phase`, `/gsd:execute-phase` → `/gsd-execute-phase`

Also replace path references:
- `~/.claude/` → `./.opencode/` (relative to project, since pilot symlinks)

---

## 2. Command Files — All 30 Files

**Location:** `commands/gsd/*.md`

### Frontmatter Format Changes (ALL commands)

Every command file needs these frontmatter changes:

1. **Remove `name:` field** — opencode derives from filename
2. **Change `allowed-tools:` list to `tools:` object** format
3. **Remove `AskUserQuestion`** from tools in every file (the core change — agents must never try to ask questions)
4. **Keep `argument-hint:`** and `description:`

#### Tool name mapping (fork → opencode):

| Fork (allowed-tools) | opencode (tools) |
|---|---|
| `Read` | `read: true` |
| `Write` | `write: true` |
| `Edit` | `edit: true` |
| `Bash` | `bash: true` |
| `Grep` | `grep: true` |
| `Glob` | `glob: true` |
| `Task` | `task: true` |
| `WebSearch` | `websearch: true` |
| `WebFetch` | `webfetch: true` |
| `TodoWrite` | `todowrite: true` |
| `SlashCommand` | `slashcommand: true` |
| `AskUserQuestion` | **REMOVE** (do not include) |
| `mcp__context7__*` | `mcp__context7__*: true` |

### Commands with `AskUserQuestion` to remove (16 files):

1. `add-todo.md`
2. `check-todos.md`
3. `debug.md`
4. `discuss-phase.md`
5. `execute-phase.md`
6. `health.md`
7. `new-milestone.md`
8. `new-project.md`
9. `plan-milestone-gaps.md`
10. `quick.md`
11. `reapply-patches.md`
12. `resume-work.md`
13. `settings.md`
14. `update.md`

### Path Reference Changes (ALL commands)

In `<execution_context>` blocks, replace:
- `@~/.claude/get-shit-done/` → `@./.opencode/get-shit-done/`
- `@~/.claude/agents/` → `@./.opencode/agents/`

This is critical because pilot symlinks into project `.opencode/` directories.

### Slash Command Syntax in Body Text (ALL commands)

Replace throughout:
- `/gsd:command-name` → `/gsd-command-name`

### Example: `commands/gsd/new-project.md`

**Before:**
```yaml
---
name: gsd:new-project
description: Initialize a new project with deep context gathering and PROJECT.md
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
```

**After:**
```yaml
---
description: Initialize a new project with deep context gathering and PROJECT.md
argument-hint: "[--auto]"
tools:
  read: true
  bash: true
  write: true
  task: true
---
```

### Example: `commands/gsd/execute-phase.md`

**Before:**
```yaml
---
name: gsd:execute-phase
description: Execute all plans in a phase with wave-based parallelization
argument-hint: "<phase-number> [--gaps-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TodoWrite
  - AskUserQuestion
---
```

**After:**
```yaml
---
description: Execute all plans in a phase with wave-based parallelization
argument-hint: "<phase-number> [--gaps-only]"
tools:
  read: true
  write: true
  edit: true
  glob: true
  grep: true
  bash: true
  task: true
  todowrite: true
---
```

### Special case: `commands/gsd/reapply-patches.md`

This file uses inline `allowed-tools:` format:
```yaml
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
```
Convert to same object format, remove AskUserQuestion.

### Special case: `commands/gsd/debug.md`

Body text at line 53 contains `Use AskUserQuestion for each:` — replace with:
```
For each issue, automatically select the most likely root cause and proceed with investigation.
```

---

## 3. Workflow Files — Strip Interactivity

These are the critical changes that prevent stdin blocking.

### 3a. `workflows/new-project.md` — 🔴 CRITICAL

**Lines 82-167 (Step 2a: Auto Mode Config):** Replace the two `AskUserQuestion` rounds with hardcoded defaults.

**Current (lines 82-167):**
```markdown
## 2a. Auto Mode Config (auto mode only)

**If auto mode:** Collect config settings upfront before processing the idea document.

YOLO mode is implicit (auto = YOLO). Ask remaining config questions:

**Round 1 — Core settings (3 questions, no Mode question):**

```
AskUserQuestion([
  {
    header: "Depth",
    question: "How thorough should planning be?",
    ...7 questions across 2 rounds...
])
```

Create `.planning/config.json` with mode set to "yolo":
```

**Replace with:**
```markdown
## 2a. Auto Mode Config (auto mode only)

**If auto mode:** Use optimal defaults without asking. No questions — fully autonomous.

YOLO mode is implicit (auto = YOLO).

Create `.planning/config.json` with autonomous defaults:

```json
{
  "mode": "yolo",
  "depth": "quick",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": true
  }
}
```

Proceed to Step 3 (skip brownfield offer in auto mode — already handled in Step 2).
```

**Lines 60-76 (Step 2: Brownfield Offer):** Already has `**If auto mode:** Skip to Step 4` — this is fine, no change needed.

**Lines 216-254 (Step 3: Interactive questioning):** Already skipped in auto mode (Step 2 routes auto to Step 4). No change needed.

**Lines 346-400 (Step 5: Config settings — interactive mode):** This section has more `AskUserQuestion` calls but they're for interactive mode only. Since pilot always passes `--auto`, these won't trigger. **No change needed** but add a guard comment:

After the Step 5 header, add:
```markdown
**If auto mode:** Skip entirely — config was set in Step 2a.
```

**Lines 506 (Step 7 area):** Another `AskUserQuestion` for requirements confirmation in interactive mode. Add auto-mode guard:
```markdown
**If auto mode:** Auto-approve and continue.
```

**Lines 770, 811, 829, 984:** More interactive `AskUserQuestion` calls in later steps. All should be guarded with auto-mode bypass. Pattern: before each `AskUserQuestion` block, add `**If auto mode:** Use default (first option) and continue.`

### 3b. `workflows/plan-phase.md` — 🔴 CRITICAL

**Lines 53-63 (Step 4: Load CONTEXT.md):**

**Current:**
```markdown
**If `context_path` is null (no CONTEXT.md exists):**

Use AskUserQuestion:
- header: "No context"
- question: "No CONTEXT.md found for Phase {X}. Plans will use research and requirements only — your design preferences won't be included. Continue or capture context first?"
- options:
  - "Continue without context" — Plan using research + requirements only
  - "Run discuss-phase first" — Capture design decisions before planning
```

**Replace with:**
```markdown
**If `context_path` is null (no CONTEXT.md exists):**

**If `--auto` flag or `workflow.auto_advance` is true:** Continue without context (proceed to step 5). Log: `ℹ No CONTEXT.md — planning from research + requirements only.`

**Otherwise (interactive mode):**
Use AskUserQuestion:
- header: "No context"
- question: "No CONTEXT.md found for Phase {X}. Plans will use research and requirements only — your design preferences won't be included. Continue or capture context first?"
- options:
  - "Continue without context" — Plan using research + requirements only
  - "Run discuss-phase first" — Capture design decisions before planning
```

**Line 137 (Step 6: Check Existing Plans):**

**Current:**
```markdown
**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.
```

**Replace with:**
```markdown
**If exists AND auto mode (`--auto` or `workflow.auto_advance`):** Replan from scratch — delete existing plans in phase directory and continue to Step 7.

**If exists AND interactive mode:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.
```

### 3c. `workflows/transition.md` — 🟡 MEDIUM

**Lines ~56-72 (incomplete plans safety rail):**

**Current:**
```markdown
**If plans incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete plans is destructive — ALWAYS prompt regardless of mode.

Present:
...
⚠️ Safety rail: Skipping plans requires confirmation (destructive action)

Options:
1. Continue current phase (execute remaining plans)
2. Mark complete anyway (skip remaining plans)
3. Review what's left
```

Wait for user decision.
```

**Replace with:**
```markdown
**If plans incomplete:**

<if mode="yolo" AND="workflow.auto_advance true">

```
⚠️ Auto-mode: Phase [X] has incomplete plans — marking complete anyway.
Incomplete: {list incomplete plans}
Reason: autonomous mode auto-advances; queue runner handles retries at pipeline level.
```

Mark phase complete. Log the incomplete plans in STATE.md under Accumulated Context > Concerns. Proceed to cleanup_handoff step.

</if>

<if mode="interactive" OR="auto_advance false">

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete plans is destructive — prompt for confirmation.

Present:
...existing options...

Wait for user decision.

</if>
```

### 3d. `workflows/quick.md` — 🟡 MEDIUM

**Lines 21-27 (empty description prompt):**

**Current:**
```markdown
If `$DESCRIPTION` is empty after parsing, prompt user interactively:

```
AskUserQuestion(
  header: "Quick Task",
  question: "What do you want to do?",
  followUp: null
)
```
```

**Replace with:**
```markdown
If `$DESCRIPTION` is empty after parsing:

**If running autonomously (< /dev/null or no TTY):** Exit with error: `❌ Quick task requires a description. Usage: /gsd-quick <description>`

**If interactive:** Prompt user:
```
AskUserQuestion(
  header: "Quick Task",
  question: "What do you want to do?",
  followUp: null
)
```
```

### 3e. `workflows/execute-plan.md` — 🟡 MEDIUM

**Line 128 (previous issues check):**

**Current:**
```markdown
If previous SUMMARY has unresolved "Issues Encountered" or "Next Phase Readiness" blockers: AskUserQuestion(header="Previous Issues", options: "Proceed anyway" | "Address first" | "Review previous").
```

**Replace with:**
```markdown
If previous SUMMARY has unresolved "Issues Encountered" or "Next Phase Readiness" blockers:

**If auto mode:** Log warning and proceed anyway. Note in SUMMARY.md that previous issues were auto-bypassed.

**If interactive:** AskUserQuestion(header="Previous Issues", options: "Proceed anyway" | "Address first" | "Review previous").
```

### 3f. Other Workflow Files with `AskUserQuestion`

These are lower priority but should all get auto-mode guards:

| File | Line(s) | Current | Change |
|------|---------|---------|--------|
| `add-todo.md` | 72 | `AskUserQuestion` for overlapping todos | Add: `If auto mode: auto-merge and continue` |
| `check-todos.md` | 104, 115 | `AskUserQuestion` for todo selection | Add: `If auto mode: select first/highest priority` |
| `cleanup.md` | 96 | `AskUserQuestion` for archive confirmation | Add: `If auto mode: auto-approve archive` |
| `complete-milestone.md` | 385, 387, 507 | `AskUserQuestion` for archive/branch decisions | Add: `If auto mode: archive phases, squash merge` |
| `discovery-phase.md` | 217 | `AskUserQuestion` | Add: `If auto mode: use defaults` |
| `new-milestone.md` | 87, 210, 217, 323 | Multiple `AskUserQuestion` calls | Add auto-mode guards to each |
| `execute-phase.md` (workflow) | 420 | "ask user how to proceed" on agent failure | Add: `If auto mode: log failure and continue with remaining plans` |
| `pause-work.md` | 19 | "ask user which phase" | Add: `If auto mode: detect from STATE.md or exit with error` |

### 3g. Global Search-and-Replace in ALL Workflow Files

In every file under `get-shit-done/workflows/`:

1. **Path references:** `~/.claude/` → `./.opencode/`
2. **Slash commands:** `/gsd:command` → `/gsd-command`
3. **Agent references in Task calls:** `~/.claude/agents/` → `./.opencode/agents/`

---

## 4. Templates

### `templates/config.json`

**Current:**
```json
{
  "mode": "interactive",
  "depth": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  }
}
```

**Replace with:**
```json
{
  "mode": "yolo",
  "depth": "quick",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": true
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
    "confirm_project": false,
    "confirm_phases": false,
    "confirm_roadmap": false,
    "confirm_breakdown": false,
    "confirm_plan": false,
    "execute_next_plan": false,
    "issues_review": false,
    "confirm_transition": false
  },
  "safety": {
    "always_confirm_destructive": false,
    "always_confirm_external_services": false
  }
}
```

**Rationale:** All gates off. All confirmations off. Autonomous means autonomous. The queue runner handles retries and error recovery at the pipeline level.

---

## 5. References

### `references/model-profiles.md`

Add a note at the top:

```markdown
> **pilot-gsd fork:** Models are set directly in agent frontmatter (`model:` field).
> The profile system below is preserved for upstream compatibility but is not used
> when agents have explicit model assignments. The frontmatter `model:` takes precedence.
```

No other changes needed — the profile table is still useful documentation.

### `references/checkpoints.md`

Add after the `<overview>` section's golden rule #5:

```markdown
6. **pilot-gsd fork:** ALL checkpoints are auto-handled in autonomous mode. human-verify auto-approves, decision auto-selects first option. human-action checkpoints log a warning and skip (the pipeline cannot provide auth credentials or physical access).
```

### `references/questioning.md`

Add at top:

```markdown
> **pilot-gsd fork:** This reference is only used in interactive mode (discuss-phase).
> Autonomous pipeline commands (new-project --auto, plan-phase --auto) skip all questioning.
```

---

## 6. Installer (`bin/install.js`)

### No Functional Changes Required

The installer is for upstream GSD users. Pilot uses symlinks managed by `pilot setup`.

### Documentation Addition

Add a comment block at the top of `install.js` (after the shebang):

```javascript
// NOTE (pilot-gsd fork): The Pilot CLI manages installation via symlinks.
// `pilot setup` symlinks from this repo into project .opencode/ directories.
// This installer is preserved for standalone/upstream-compatible use.
// For pilot users: run `pilot setup` instead of this installer.
```

---

## 7. Global Search-and-Replace Summary

These changes apply across ALL files in the repo:

| Find | Replace | Scope | Rationale |
|------|---------|-------|-----------|
| `~/.claude/get-shit-done/` | `./.opencode/get-shit-done/` | All `@` path refs in commands & workflows | Pilot symlinks into project `.opencode/` |
| `~/.claude/agents/` | `./.opencode/agents/` | Task spawn prompts in workflows | Same reason |
| `/gsd:` | `/gsd-` | Slash command references in prose | opencode uses hyphens not colons |
| `name: gsd:` | (remove line) | Agent/command frontmatter | opencode derives name from filename |
| `name: gsd-` | (remove line) | Agent frontmatter | Same |

**Verification command:**
```bash
grep -rn '~/.claude/' ~/dev/pilot-gsd/ --include='*.md' --include='*.json' | grep -v node_modules | grep -v '.git/'
```
Should return 0 results after patching.

```bash
grep -rn '/gsd:' ~/dev/pilot-gsd/ --include='*.md' | grep -v node_modules | grep -v '.git/'
```
Should return 0 results after patching.

---

## 8. Testing Plan

### Test 1: No stdin hanging (CRITICAL)

For each pipeline command, verify it doesn't block on stdin:

```bash
cd /tmp/test-gsd-project

# Test new-project
echo '{}' > opencode.json
timeout 30 opencode run --command gsd-new-project "--auto @requirements.md" < /dev/null 2>&1 | tail -5
# PASS: exits (success or error) within 30s
# FAIL: timeout kills it (stdin hang)

# Test plan-phase
timeout 30 opencode run --command gsd-plan-phase "1 --auto" < /dev/null 2>&1 | tail -5

# Test execute-phase
timeout 30 opencode run --command gsd-execute-phase "1 --auto" < /dev/null 2>&1 | tail -5

# Test quick
timeout 30 opencode run --command gsd-quick "fix the navbar" < /dev/null 2>&1 | tail -5
```

### Test 2: Frontmatter parsing

```bash
# Verify opencode can parse all agent files
for f in ~/dev/pilot-gsd/agents/*.md; do
  echo "Checking $(basename $f)..."
  # opencode should list agent without errors
done
```

### Test 3: Path resolution

```bash
# Verify all @-references resolve when symlinked
cd /tmp/test-project
ln -s ~/dev/pilot-gsd/agents .opencode/agents
ln -s ~/dev/pilot-gsd/commands/gsd .opencode/command
ln -s ~/dev/pilot-gsd/get-shit-done .opencode/get-shit-done

# Check that referenced files exist
grep -roh '@[^ ]*' .opencode/command/*.md | sort -u | while read ref; do
  path="${ref#@}"
  path="${path/.\//$(pwd)/}"
  [ -f "$path" ] && echo "OK: $ref" || echo "MISSING: $ref → $path"
done
```

### Test 4: Full pipeline dry run

```bash
# Create minimal test project and run full pipeline
mkdir -p /tmp/gsd-test && cd /tmp/gsd-test
# ... setup symlinks ...
echo "# Build a hello world CLI" > requirements.md
opencode run --command gsd-new-project "--auto @requirements.md" < /dev/null
opencode run --command gsd-plan-phase "1 --auto" < /dev/null
opencode run --command gsd-execute-phase "1 --auto" < /dev/null
# Verify: .planning/ directory populated, commits made, no hangs
```

### Test 5: grep for remaining interactive patterns

```bash
# After all changes, verify no AskUserQuestion remains in autonomous paths
grep -rn 'AskUserQuestion' ~/dev/pilot-gsd/commands/gsd/*.md
# Should return 0 results (removed from all command tool lists)

# Check workflows still have AskUserQuestion only inside interactive guards
grep -B2 'AskUserQuestion' ~/dev/pilot-gsd/get-shit-done/workflows/*.md | grep -v 'interactive\|Otherwise\|auto mode'
# Review any unguarded occurrences
```

---

## 9. Implementation Order

1. **Agent frontmatter** (11 files) — mechanical, low risk
2. **Command frontmatter** (30 files) — mechanical, low risk
3. **Global path replacement** (`~/.claude/` → `./.opencode/`, `/gsd:` → `/gsd-`) — mechanical
4. **templates/config.json** — one file, clear target
5. **workflows/new-project.md** Step 2a — eliminates 7 questions (🔴 critical)
6. **workflows/plan-phase.md** Steps 4 & 6 — eliminates 2 blocking points (🔴 critical)
7. **workflows/transition.md** — auto-advance on incomplete plans (🟡 medium)
8. **workflows/quick.md** — error on empty description (🟡 medium)
9. **workflows/execute-plan.md** — auto-bypass previous issues (🟡 medium)
10. **Other workflow files** — add auto-mode guards (🟢 low priority)
11. **References** — add notes (🟢 low priority)
12. **Installer comment** — documentation only (🟢 low priority)
13. **Run test suite** — verify no hangs

---

## 10. File Inventory

Total files requiring changes:

| Category | Count | Files |
|----------|-------|-------|
| Agents | 11 | All in `agents/` |
| Commands | 30 | All in `commands/gsd/` |
| Workflows (critical) | 3 | new-project.md, plan-phase.md, transition.md |
| Workflows (medium) | 2 | quick.md, execute-plan.md |
| Workflows (low) | 8 | add-todo, check-todos, cleanup, complete-milestone, discovery-phase, new-milestone, execute-phase, pause-work |
| Templates | 1 | config.json |
| References | 3 | model-profiles.md, checkpoints.md, questioning.md |
| Installer | 1 | bin/install.js |
| **Total** | **~59** | |
