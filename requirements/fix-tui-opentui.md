# Fix TUI — Replace React/Ink with Solid/OpenTUI

## Problem
Phase 18 was supposed to build a TUI using `@opentui/core` + `@opentui/solid` (already in package.json), but the generated code uses React + Ink instead. The TUI crashes because:
1. `react` and `ink` are not dependencies
2. All JSX files import from `react/jsx-runtime` instead of `solid-js`
3. Components use Ink's `<Box>`, `<Text>` instead of OpenTUI equivalents

## Goal
Working `pilot tui` command that shows a live dashboard using OpenTUI + Solid.

## Requirements

### Must Have
- [ ] Replace ALL React/Ink imports in `src/tui/` with Solid + OpenTUI equivalents
- [ ] `tsconfig.json` already has `"jsxImportSource": "solid-js"` — all TSX must be Solid JSX
- [ ] Use `@opentui/core` and `@opentui/solid` (already installed)
- [ ] `pilot tui` launches without errors under `bun` (shebang is `#!/usr/bin/env bun`)
- [ ] Dashboard shows: active jobs, queue, recent history (same data as `pilot status`)
- [ ] Auto-refreshes every 2-3 seconds
- [ ] Remove `ink` and `react` from any imports (they're not dependencies)

### Nice to Have
- [ ] Color-coded status (green=completed, red=failed, blue=running, dim=pending)
- [ ] Log panel showing latest messages from active job
- [ ] Keyboard shortcuts: q=quit, r=retry selected, l=show log

## Technical Notes
- Entry: `src/tui/App.tsx` → imported by `src/commands/tui.ts`
- OpenTUI docs: check `node_modules/@opentui/solid/` for available components
- Data: reuse `getQueue()`, `getRecent()` from `src/core/db.ts`
- Bun is required (Node can't handle OpenTUI's `.scm` tree-sitter files)

## Do NOT
- Use React, Ink, or Blessed — OpenTUI + Solid ONLY
- Add react/ink as dependencies
- Change the Solid jsxImportSource in tsconfig
