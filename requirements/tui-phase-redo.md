# TUI Phase — Proper OpenTUI/Solid Build Setup

## Problem
The TUI doesn't work. Multiple cascading issues:

1. **Build output mismatch**: `tsconfig.json` has `jsx: "preserve"` which outputs `.jsx` files, but imports reference `.js`. Bun can't find `./app.js` when the file is `app.jsx`.
2. **Mixed JSX sources**: The CLI is non-JSX TypeScript, but TUI uses `@opentui/solid` JSX with `@jsxImportSource @opentui/solid` pragma. Single tsconfig can't serve both.
3. **Stale dist/ files**: Previous Phase 18 React/Ink build left uppercase `App.js` files that shadow the new lowercase `app.jsx` files. `tsc` doesn't clean `dist/` before building.
4. **React/Ink remnants**: Phase 18 generated React/Ink components (Dashboard.js, LogPanel.js etc.) that are stale in dist/ and may still be imported somewhere.

## Goal
`pilot tui` launches a working TUI dashboard under bun.

## Requirements

### Must Have — Build Setup
- [ ] **Do NOT compile TUI with tsc** — exclude `src/tui/` from tsconfig.json `include` (or add to `exclude`)
- [ ] TUI runs directly from source `.tsx` files via bun (bun natively handles TS/TSX/Solid JSX)
- [ ] `commands/tui.ts` dynamically imports `../tui/index.tsx` (source, not dist) — bun resolves it at runtime
- [ ] Non-TUI CLI code continues to build with regular `tsc` as before
- [ ] `npm run build` cleans `dist/` before compiling (add `rm -rf dist` to prebuild)
- [ ] Bun plugin registration in `commands/tui.ts` before importing TUI (already added by quick-009)
- [ ] TUI source files use `@jsxImportSource @opentui/solid` pragma (already do)

### Must Have — TUI Functionality
- [ ] `pilot tui` launches without errors under bun
- [ ] Dashboard shows: active jobs (with elapsed time), pending queue, recent history
- [ ] Auto-refreshes every 2-3 seconds
- [ ] Data from `getQueue()`, `getRecent()`, `getActive()` in `src/core/db.ts`
- [ ] Keyboard: q=quit

### Must Have — Cleanup
- [ ] Remove ALL React/Ink component files from src/tui/ (Dashboard.js, LogPanel.js etc. if they exist as source)
- [ ] Remove `ink`, `react` from any imports
- [ ] Verify no stale uppercase files in dist/ after clean build

### Nice to Have
- [ ] Color-coded status (green=completed, red=failed, blue=running, dim=pending)
- [ ] Log panel showing latest parts from active job's session
- [ ] Keyboard: r=retry selected, l=show log, j/k=navigate

## Technical Notes
- OpenTUI + Solid docs: check `node_modules/@opentui/solid/` and `node_modules/@opentui/core/`
- Bun is required runtime (Node can't handle `.scm` tree-sitter files from OpenTUI)
- Shebang is already `#!/usr/bin/env bun` (fixed in postbuild)
- `bunfig.toml` already exists with preload for dev mode
- **Key insight**: bun runs .ts/.tsx natively — no compilation step needed for TUI. Just import source files directly.
- The `commands/tui.ts` import path should point to `../tui/index.tsx` (or `.ts`) — bun resolves it at runtime, tsc never sees it
- Current TUI source files in `src/tui/`: app.tsx, index.ts, state.ts, theme.ts, components/, data/

## Do NOT
- Use React, Ink, or Blessed
- Break the regular CLI (non-TUI commands must still work under both node and bun)
- Change `tsconfig.json` in a way that breaks non-TUI compilation
- Keep any stale Phase 18 React code
