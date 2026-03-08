---
phase: quick-077
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - ~/.openclaw/skills/pilot-pipeline/SKILL.md
autonomous: true
must_haves:
  truths:
    - "Every command in README.md CLI Reference appears in SKILL.md Quick Reference table"
    - "pilot export, pilot info, pilot undo are documented with flags and usage"
    - "--why flag documented for status and retry commands"
    - "Grace period concept explained with --start-immediately"
    - "Observability signals format documented with model/tok/cost/partial semantics"
    - "No stale information contradicting current behavior"
  artifacts:
    - path: "~/.openclaw/skills/pilot-pipeline/SKILL.md"
      provides: "Updated OpenClaw skill reflecting phases 43-45"
  key_links: []
---

<objective>
Update the OpenClaw SKILL.md at ~/.openclaw/skills/pilot-pipeline/SKILL.md to reflect all current pilot capabilities from phases 43-45: export, info, undo, --why, grace period, observability signals, and cross-check against README.md CLI Reference.

Purpose: Keep the agent-facing skill documentation accurate so OpenClaw sessions have correct CLI reference when operating Pilot.
Output: Updated SKILL.md with all new features documented.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@README.md
@~/.openclaw/skills/pilot-pipeline/SKILL.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add new sections — Recovery, Grace Period, Observability, What's New</name>
  <files>~/.openclaw/skills/pilot-pipeline/SKILL.md</files>
  <action>
Add the following new sections to SKILL.md. Insert them in logical positions within the existing structure — do NOT rewrite from scratch.

**1. What's New section (insert after the opening role description, before "First-Time Setup"):**

Brief callout noting phases 43-45 additions:
- `pilot undo` for git-checkpoint recovery
- `pilot export` for portable markdown artifacts
- `pilot info` for full observability snapshots
- `--why` flag for status/retry introspection
- Queue grace period with `--start-immediately` bypass
- Compact observability signals (`[obs model:X tok:Y cost:~$Z]`)

**2. Recovery section (insert after "When Things Go Wrong" section, before "Notification Pipeline"):**

Title: "## Recovery — Undo and Checkpoints"

Document:
- Pilot records a per-job git base/head checkpoint on every run
- `pilot undo <id>` rolls back to the recorded base checkpoint
- `--dry-run` flag shows what would be reverted without changing anything
- Safety guards: undo is REFUSED when newer commits exist after the job's checkpoint (other work would be lost)
- `--force` overrides the newer-commits guard (history may be discarded) but does NOT bypass a currently dirty worktree
- Clean start (default) gives safest checkpoint behavior; `--force-dirty` weakens rollback guarantees
- Usage examples:
  ```bash
  pilot undo ab12 --dry-run   # Inspect first
  pilot undo ab12             # Safe rollback
  pilot undo ab12 --force     # Override newer-commits guard
  ```

**3. Grace Period section (insert after "Daemon Management", before "Quick Reference"):**

Title: "## Queue Grace Period"

Document:
- New jobs wait a configurable grace window before becoming eligible for launch
- Purpose: gives you time to review, cancel, or adjust a job before it starts
- Controlled by `PILOT_QUEUE_GRACE_SECONDS` env var (default: 0 = disabled)
- `--start-immediately` flag on `pilot add` bypasses the grace wait for that job
- `pilot status --why` shows grace-wait status with remaining seconds
- Example:
  ```bash
  # Set 60s grace window
  export PILOT_QUEUE_GRACE_SECONDS=60

  # This job waits 60s before launch
  pilot add ~/dev/myapp "Fix auth bug"

  # This job skips the wait
  pilot add ~/dev/myapp "Urgent hotfix" --start-immediately
  ```

**4. Observability Signals section (insert after Grace Period, before "Quick Reference"):**

Title: "## Observability Signals"

Document:
- Compact format shown in `pilot status` output: `[obs model:X tok:Y cost:~$Z]`
- Semantic levels:
  - `requested` — what profile/provider/lane was requested for the run
  - `observed` — what models and tokens were actually seen from opencode session data
  - `estimated` — cost derived from observed tokens and maintained pricing assumptions
  - `unavailable` — data could not be resolved (missing session, pricing, or no token rollup yet)
- Markers: `live` (job still running, data incomplete), `partial` (some data unavailable)
- Cost values are intentionally labeled as estimates — useful for operator triage, not exact billing
- Commands that surface observability:
  - `pilot status` — compact `[obs ...]` per job
  - `pilot info <id>` — full observability snapshot with requested/observed/estimated breakdown
  - `pilot log <id> --summary` — high-signal summary without transcript stream
  - `pilot export <id>` — portable markdown artifact including observability data

Keep all new sections concise and agent-oriented. Match the existing tone (direct, imperative, example-heavy).
  </action>
  <verify>
Read the updated SKILL.md and confirm:
- "Recovery" section exists with undo/dry-run/force docs
- "Grace Period" section exists with PILOT_QUEUE_GRACE_SECONDS and --start-immediately
- "Observability Signals" section exists with format and semantic levels
- "What's New" callout exists
- Existing sections are unchanged
  </verify>
  <done>Four new sections added to SKILL.md without rewriting existing content</done>
</task>

<task type="auto">
  <name>Task 2: Update Monitoring section and Quick Reference table — cross-check against README</name>
  <files>~/.openclaw/skills/pilot-pipeline/SKILL.md</files>
  <action>
**1. Update "Monitoring" section:**

Add to the Monitoring section (alongside existing status/queue/log docs):

- `pilot info <id>` — full job metadata, observability snapshot (requested/observed/estimated/unavailable), and failure insight
- `pilot export <id>` — generate portable markdown artifact; flags: `--output <path>`, `--stdout`
- `pilot log <id> --summary` — compact metadata summary without transcript
- `pilot status --why` — show concise reason/action guidance for queued and guarded jobs
- `pilot retry <id> --why` — explain retry context without mutating job state

Add brief usage examples for info and export:
```bash
pilot info ab12               # Full observability snapshot
pilot export ab12             # Export to ~/.pilot/exports/job-ab12.md
pilot export ab12 --stdout    # Stream to stdout for piping
```

**2. Cross-check and update Quick Reference table:**

Compare every command in README.md CLI Reference (lines 366-428) against the SKILL.md Quick Reference table. Add ALL missing entries. The following are missing and must be added:

| `pilot info <id>` | Full job metadata + observability |
| `pilot export <id>` | Export markdown artifact |
| `pilot export <id> --output <path>` | Custom export path |
| `pilot export <id> --stdout` | Stream to stdout |
| `pilot undo <id>` | Roll back to checkpoint |
| `pilot undo <id> --dry-run` | Preview rollback |
| `pilot undo <id> --force` | Override newer-commits guard |
| `pilot status --why` | Reason/action for queued jobs |
| `pilot retry <id> --why` | Explain retry context |
| `pilot log <id> --summary` | Compact metadata summary |
| `pilot log <id> --flat` | Flat output (no nesting) |
| `pilot log <id> --task <n>` | Show specific task |
| `pilot add ... --force-dirty` | Allow dirty worktree |
| `pilot add ... --start-immediately` | Bypass grace wait |
| `pilot add ... --timeout <min>` | Per-job timeout |
| `pilot config` | Show resolved config |
| `pilot reload` | Signal daemon to reload |
| `pilot milestone <action> <id>` | Milestone: status/resume/skip |
| `pilot tui` | Full-screen TUI dashboard |

Group entries logically (keep existing grouping — add entries near related commands).

**3. Update "Your Role" tools list:**

The tools list at the top (lines 22-28) is incomplete. Add:
- `pilot info` — Full job observability
- `pilot export` — Export job artifacts
- `pilot undo` — Recovery rollback

**4. Remove stale info:**

- Check that no existing text contradicts current behavior
- The SKILL.md currently has no stale info based on review, but verify during editing
  </action>
  <verify>
Cross-check: every command in README.md lines 366-428 must appear in the updated SKILL.md Quick Reference table.

Specifically verify these are present:
- `pilot info <id>`
- `pilot export <id>` with --output and --stdout
- `pilot undo <id>` with --dry-run and --force
- `pilot status --why`
- `pilot retry <id> --why`
- `pilot log <id> --summary`
- `pilot config`
- `pilot reload`
- `pilot milestone`
- `pilot tui`
- `pilot add --force-dirty`
- `pilot add --start-immediately`
- `pilot add --timeout`
  </verify>
  <done>Quick Reference table complete — every README CLI Reference command has a corresponding SKILL.md entry. Monitoring section includes info, export, --summary, and --why docs. Role tools list updated.</done>
</task>

</tasks>

<verification>
1. Read the final SKILL.md and confirm all 4 new sections exist
2. Count Quick Reference table rows and verify ≥ README CLI Reference command count
3. Confirm no README commands are missing from SKILL.md
4. Confirm README.md and GETTING-STARTED.md were NOT modified
</verification>

<success_criteria>
- Every command in README.md CLI Reference appears in SKILL.md Quick Reference
- pilot export, info, undo documented with flags and examples
- --why flag documented for status and retry
- Grace period concept documented with env var and --start-immediately
- Observability signals format and semantics documented
- What's New callout present
- No stale/contradictory information
- README.md and GETTING-STARTED.md untouched
</success_criteria>

<output>
After completion, create `.planning/quick/077-update-the-openclaw-skill-md-at-openclaw/077-SUMMARY.md`
</output>
