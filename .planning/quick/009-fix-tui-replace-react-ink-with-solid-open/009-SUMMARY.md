---
phase: quick-009
plan: 01
subsystem: tui
tags: [opentui, solid-js, bun-plugin, tui, fix]
completed: 2026-03-02
duration: 2m
dependency-graph:
  requires: [18-05]
  provides: [working-tui-launch]
  affects: []
tech-stack:
  added: []
  patterns: [bun-plugin-preload, dynamic-import-before-module-tree]
key-files:
  created: []
  modified: [src/commands/tui.ts, bunfig.toml]
decisions:
  - id: q009-01
    description: "Dynamic import('bun') + import('@opentui/solid/bun-plugin') before TUI module tree"
    rationale: "Plugin must register before solid-js is resolved; dynamic import keeps CLI startup fast"
  - id: q009-02
    description: "bunfig.toml preload at top level for dev convenience"
    rationale: "Belt-and-suspenders: runtime plugin handles installed binary; bunfig handles bun run dev"
metrics:
  tasks: 1/1
  commits: 1
  duration: 2m
---

# Quick Task 009: Fix TUI — Register @opentui/solid bun plugin Summary

**One-liner:** Register @opentui/solid bun plugin before TUI import to fix solid-js SSR server bundle resolution crash.

## What Was Done

### Task 1: Register bun plugin in TUI command + add bunfig preload

**Root cause:** Bun resolves `solid-js` to `dist/server.js` (SSR bundle) under the `"node"` export condition. The SSR bundle's `createRoot` throws in non-server contexts, crashing `pilot tui` on launch.

**Fix applied:**

1. **`src/commands/tui.ts`** — Added three lines before the TUI module import:
   - `import('bun')` to get the `plugin` function
   - `import('@opentui/solid/bun-plugin')` to get the solid plugin
   - `plugin(solidPlugin)` to register before any TUI imports
   
   This ensures solid-js resolves to `dist/solid.js` (client bundle) instead of `dist/server.js` when the TUI module tree loads.

2. **`bunfig.toml`** — Added `preload = ["@opentui/solid/preload"]` at top level for dev convenience when running `bun run src/index.ts tui` directly.

## Verification Results

- `pilot tui` launches without `createRoot` crash: **PASS** (0 occurrences of createRoot error)
- Dashboard renders panels (Queue, Running, Completed): **PASS** (panels detected in output)
- `tsc --noEmit` passes clean: **PASS**

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | a5e4a57 | fix(quick-009): register @opentui/solid bun plugin before TUI import |
