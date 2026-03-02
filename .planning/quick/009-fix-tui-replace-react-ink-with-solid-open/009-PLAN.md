---
phase: quick-009
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/commands/tui.ts
  - bunfig.toml
autonomous: true
must_haves:
  truths:
    - "`pilot tui` launches without errors when run via bun"
    - "Dashboard renders three panels (queue, running, completed) with live data"
    - "Auto-refresh updates data every 1-5 seconds"
    - "Keyboard shortcuts work (q=quit, Tab=cycle, j/k=navigate)"
  artifacts:
    - path: "src/commands/tui.ts"
      provides: "TUI command with bun plugin registration before TUI import"
    - path: "bunfig.toml"
      provides: "Bun preload config for dev convenience"
  key_links:
    - from: "src/commands/tui.ts"
      to: "src/tui/index.ts"
      via: "dynamic import after plugin registration"
      pattern: "plugin\\(solidPlugin\\).*import.*tui/index"
---

<objective>
Fix `pilot tui` crash by registering the @opentui/solid bun plugin before importing TUI modules.

Purpose: The TUI crashes because bun resolves `solid-js` to the SSR server bundle (`dist/server.js`) instead of the client bundle (`dist/solid.js`). The `@opentui/solid` library ships a bun plugin that redirects this resolution and transforms JSX via babel-preset-solid, but it must be registered as a preload or before any TUI imports.

Output: Working `pilot tui` command that launches the full-screen dashboard.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/commands/tui.ts
@src/tui/index.ts
@src/tui/app.tsx
@bunfig.toml
@node_modules/@opentui/solid/scripts/preload.ts
@node_modules/@opentui/solid/scripts/solid-plugin.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Register bun plugin in TUI command + add bunfig preload</name>
  <files>src/commands/tui.ts, bunfig.toml</files>
  <action>
**Root cause:** Bun resolves `solid-js` to `dist/server.js` (SSR bundle) under the `"node"` export condition. The SSR bundle's `createRoot` throws in non-server contexts. OpenTUI ships a bun plugin (`@opentui/solid/bun-plugin`) that:
1. Redirects `solid-js/dist/server.js` → `solid-js/dist/solid.js` (client bundle)
2. Redirects `solid-js/store/dist/server.js` → `solid-js/store/dist/store.js`
3. Transforms `.tsx` files through `babel-preset-solid` with `moduleName: "@opentui/solid"` and `generate: "universal"`

**Fix `src/commands/tui.ts`:**
Register the bun plugin BEFORE the dynamic import of `../tui/index.js`. This ensures solid-js resolves to the client bundle when the TUI module tree loads.

```typescript
/**
 * `pilot tui` — launch full-screen TUI dashboard.
 *
 * Lazily loads @opentui/solid and the TUI module to keep
 * CLI startup fast for all other commands.
 *
 * IMPORTANT: Must register the @opentui/solid bun plugin BEFORE
 * importing the TUI module tree. The plugin redirects solid-js
 * from the SSR server bundle to the client bundle and transforms
 * JSX via babel-preset-solid.
 */

export async function tuiCommand(opts: { interval?: number }): Promise<void> {
  // Register OpenTUI's bun plugin to fix solid-js resolution
  // (bun resolves solid-js to server.js which crashes in non-SSR context)
  const { plugin } = await import('bun');
  const { default: solidPlugin } = await import('@opentui/solid/bun-plugin');
  plugin(solidPlugin);

  const { startTui } = await import('../tui/index.js');
  await startTui({ interval: opts.interval });
}
```

Key points:
- Dynamic `import('bun')` means this only runs when invoked via bun runtime (which is always the case for this project — shebang is `#!/usr/bin/env bun`)
- Dynamic `import('@opentui/solid/bun-plugin')` avoids loading babel/solid at CLI startup for all other commands
- Plugin registration happens before `import('../tui/index.js')` so solid-js resolves correctly when the TUI module tree loads
- Use `// @ts-ignore` or `// @ts-expect-error` on the bun import if needed (bun types may not be in scope for tsc)

**Fix `bunfig.toml`:**
Add preload for dev convenience (when running `bun run src/index.ts tui` directly):

```toml
[install]
peer = false

preload = ["@opentui/solid/preload"]
```

This is belt-and-suspenders: the runtime plugin in tui.ts handles the installed binary case; the bunfig preload handles the dev case. Both are needed because:
- bunfig.toml is only read from cwd or parent dirs (not available for globally installed binary)
- Runtime plugin handles all cases but bunfig preload is cleaner for dev

Note: The `preload` must be at the TOP LEVEL of bunfig.toml, NOT under `[install]`.
  </action>
  <verify>
1. Run `timeout 5 bun run src/index.ts tui 2>&1 | strings | grep -c 'at createRoot'` — should output `0` (no crash)
2. Run `timeout 3 bun run src/index.ts tui 2>&1 | cat -v | grep -c 'Pilot v2\|Queue\|Running\|Completed'` — should be > 0 (panels rendered)
3. `tsc --noEmit` should pass (or at least not regress — ignore existing errors)
  </verify>
  <done>
- `pilot tui` launches without the `createRoot` crash
- Dashboard renders status bar, queue panel, running panel, completed panel
- Auto-refresh polls update data on 1-5 second intervals
- q/Ctrl+C exits cleanly
  </done>
</task>

</tasks>

<verification>
1. `bun run src/index.ts tui` launches without errors and shows the dashboard
2. Data from pilot.db and opencode.db displays in the correct panels
3. Keyboard navigation works (Tab cycles panels, j/k moves cursor, q quits)
4. No React or Ink imports anywhere in src/tui/ (already verified — there are none)
</verification>

<success_criteria>
- `pilot tui` command launches a working full-screen TUI dashboard using @opentui/solid
- No `createRoot` or solid-js server bundle errors
- All existing TUI components render correctly (status bar, queue, running, completed panels)
- Clean exit on q or Ctrl+C
</success_criteria>

<output>
After completion, create `.planning/quick/009-fix-tui-replace-react-ink-with-solid-open/009-SUMMARY.md`
</output>
