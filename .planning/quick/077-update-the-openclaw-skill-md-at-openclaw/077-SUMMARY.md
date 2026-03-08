---
phase: quick-077
plan: 01
subsystem: docs
tags: [openclaw, skill, documentation, observability, undo, export, grace-period]
completed: 2026-03-08
duration: ~4m
dependency-graph:
  requires: [phase-43, phase-44, phase-45]
  provides: [updated-openclaw-skill-with-phases-43-45]
  affects: [openclaw-sessions-using-pilot-pipeline-skill]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - ~/.openclaw/skills/pilot-pipeline/SKILL.md
decisions: []
metrics:
  tasks-completed: 2/2
  quick-ref-entries: 60+
  readme-commands-covered: 29/29
---

# Quick 077: Update OpenClaw SKILL.md for Phases 43–45

**One-liner:** Full SKILL.md refresh with Recovery/Undo, Grace Period, Observability Signals sections, expanded Quick Reference (60+ entries), and complete README CLI cross-check.

## What Was Done

### Task 1: Add new sections — Recovery, Grace Period, Observability, What's New
**Commit:** `c084207`

Added four new sections to SKILL.md without rewriting existing content:

1. **What's New (Phases 43–45)** — bullet callout after opening description listing undo, export, info, --why, grace period, and observability signals
2. **Recovery — Undo and Checkpoints** — documents `pilot undo <id>` with `--dry-run`, `--force`, safety guards (newer commits refusal, dirty worktree protection), and decision guide
3. **Queue Grace Period** — documents `PILOT_QUEUE_GRACE_SECONDS` env var (default: 120s), `runner.queueGraceSeconds` config key, `--start-immediately` bypass flag, with usage examples
4. **Observability Signals** — documents compact `[obs model:X tok:Y cost:~$Z]` format, semantic levels (requested/observed/estimated/unavailable), live/partial markers, and commands that surface observability data

### Task 2: Update Monitoring section and Quick Reference table — cross-check against README
**Commit:** `76aa779`

1. **Monitoring section expanded** — added Introspection subsection (`--why` for status/retry), Job Observability subsection (`pilot info`, `pilot export` with examples), and additional log flags (`--summary`, `--flat`, `--task`)
2. **Quick Reference table expanded** — from 37 entries to 60+ with logical grouping (Queuing, Monitoring, Queue management, Projects, Infrastructure, Skills). All missing commands added: info, export, undo, config, reload, milestone, tui, --force-dirty, --start-immediately, --timeout, --flat, --task, --summary, skills sync
3. **Your Role tools list updated** — added `pilot info`, `pilot export`, `pilot undo`
4. **Stale info check** — no stale information found; all existing content remains accurate

## Verification

- ✅ All 4 new sections present (What's New, Recovery, Grace Period, Observability Signals)
- ✅ Every README CLI Reference command (29 unique commands) has a SKILL.md Quick Reference entry
- ✅ SKILL.md Quick Reference (84 rows) ≥ README table (73 rows)
- ✅ pilot export, info, undo documented with flags and examples
- ✅ --why flag documented for both status and retry
- ✅ Grace period documented with PILOT_QUEUE_GRACE_SECONDS env var and --start-immediately
- ✅ Observability signals format and semantic levels documented
- ✅ What's New callout present
- ✅ README.md and GETTING-STARTED.md untouched (no changes in pilot repo)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Grace period default corrected**
- Plan stated default is 0 (disabled); actual code default is 120s
- Documented the correct default (120s) from `src/core/config.ts`

**2. [Rule 3 - Blocking] File outside pilot git repo**
- `~/.openclaw/skills/pilot-pipeline/SKILL.md` is outside the pilot repo
- Committed to the home directory git repo (`/home/luca`) instead

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `c084207` | Add Recovery, Grace Period, Observability, and What's New sections |
| 2 | `76aa779` | Update Monitoring section and Quick Reference table — full README cross-check |

Note: Commits are in the home directory git repo (`/home/luca`), not the pilot repo, since `~/.openclaw/` is outside the pilot working tree.
