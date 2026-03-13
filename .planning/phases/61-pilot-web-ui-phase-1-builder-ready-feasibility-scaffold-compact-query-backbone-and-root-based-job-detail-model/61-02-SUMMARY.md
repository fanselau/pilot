---
phase: 61-pilot-web-ui-phase-1
plan: 02
subsystem: web-scaffold
tags: [tanstack-start, coss-ui, server-functions, sse, web-ui, vite]
dependency-graph:
  requires: [61-01]
  provides: [web-scaffold, server-functions, sse-streaming, coss-ui-theme]
  affects: [61-03]
tech-stack:
  added: ["@tanstack/react-start", "@tanstack/react-router", "@tanstack/react-query", "vite@7", "@tailwindcss/vite", "@coss/ui", "@base-ui/react", "tailwind-merge", "lucide-react", "class-variance-authority"]
  patterns: [server-functions, file-based-routing, css-url-import, query-client-in-root]
file-tracking:
  key-files:
    created:
      - web/package.json
      - web/vite.config.ts
      - web/tsconfig.json
      - web/src/styles.css
      - web/src/lib/server-fns.ts
      - web/src/lib/sse.ts
      - web/src/router.tsx
      - web/src/routes/__root.tsx
      - web/src/routes/index.tsx
      - web/src/vite-env.d.ts
      - web/components.json
      - web/src/components/ui/ (53 Coss UI components)
      - web/src/lib/utils.ts
      - web/src/hooks/use-media-query.ts
    modified: []
decisions:
  - id: d61-02-01
    decision: "Manual web/ scaffold instead of pnpm create @tanstack/start@latest"
    rationale: "Gives precise control over dependency versions, path aliases, and port config"
  - id: d61-02-02
    decision: "Vite 7 chosen to satisfy @tanstack/react-start peer dependency (>=7.0.0)"
    rationale: "Vite 6 had unmet peer warning; Vite 8 broke @vitejs/plugin-react and @tailwindcss/vite"
  - id: d61-02-03
    decision: "inputValidator (not validator) on createServerFn builder chain"
    rationale: "TanStack Start @1.166.8 API uses inputValidator for server function data validation"
  - id: d61-02-04
    decision: "QueryClientProvider in __root.tsx instead of separate app.tsx"
    rationale: "TanStack Start auto-generates app entry; root route is the correct integration point"
  - id: d61-02-05
    decision: "CSS ?url import with vite-env.d.ts type declaration"
    rationale: "Standard TanStack Start pattern for SSR stylesheet loading; type declaration makes tsc happy"
  - id: d61-02-06
    decision: "JobDetailEventsResponse cast for serialization constraint"
    rationale: "Record<string, unknown> → Record<string, {}> needed for TanStack Start's serializable return type validation"
  - id: d61-02-07
    decision: "Server functions import from @pilot/core/*.js with .js extension"
    rationale: "Parent project uses Node16 module resolution with .js extensions; Vite resolves these to .ts files via tsconfig paths"
metrics:
  duration: 9m
  completed: 2026-03-13
---

# Phase 61 Plan 02: Web Scaffold with TanStack Start + Coss UI Summary

**One-liner:** TanStack Start web subproject at web/ with 53 Coss UI components, 5 server functions wrapping compact query backbone, SSE polling hook, and dashboard index route loading real pilot DB data.

## What Was Done

### Task 1: Create TanStack Start web subproject with dependencies
Created web/ as a separate subproject with:
- **package.json** with TanStack Start 1.166.8, React 19, Vite 7, Tailwind CSS v4, better-sqlite3
- **vite.config.ts** with tanstackStart plugin, tailwindcss, tsconfigPaths, viteReact on port 3100
- **tsconfig.json** with Bundler module resolution and `@pilot/*` → `../src/*` path alias
- **Coss UI** initialized via `npx shadcn@latest init @coss/style` — installed 53 components with full dark/light theme tokens in styles.css
- Dev server verified booting on localhost:3100

### Task 2: Server functions and SSE streaming utility
Created `web/src/lib/server-fns.ts` with 5 server functions:
1. **getJobsListFn** — returns active/queued/recent job lists from pilot.db
2. **getJobDetailFn** — compact root-based job snapshot via getJobDetail()
3. **getSessionActivityFn** — paginated session parts with cursor
4. **getSessionChildrenFn** — subagent summary cards via getSessionChildSummaries()
5. **getJobDetailEventsFn** — incremental update deltas since cursor

Created `web/src/lib/sse.ts` with:
- **useJobDetailStream** — TanStack React Query polling hook with auto-advancing cursor, configurable interval, and enable/disable control

### Task 3: Root layout, router, and index route
Enhanced the TanStack Start route infrastructure:
- **router.tsx** — createRouter with routeTree and scroll restoration
- **__root.tsx** — root layout with HeadContent, Scripts, QueryClientProvider, Coss UI body styles
- **index.tsx** — dashboard with getJobsListFn server function loader, Coss UI Cards displaying job counts, status badges, and job lists grouped by status

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vite version pinning for peer dependency satisfaction**
- **Found during:** Task 1
- **Issue:** TanStack Start 1.166.8 requires vite >=7.0.0; Vite 8 breaks plugin-react and tailwindcss/vite
- **Fix:** Pinned to vite@7.3.1 which satisfies all peer dependencies
- **Commit:** 74a4e0b

**2. [Rule 1 - Bug] inputValidator not validator on createServerFn**
- **Found during:** Task 2
- **Issue:** Plan pseudocode used `.validator()` but actual API is `.inputValidator()`
- **Fix:** Changed all server function chains to use `.inputValidator()`
- **Commit:** 11670d1

**3. [Rule 1 - Bug] Record<string, unknown> serialization constraint**
- **Found during:** Task 2
- **Issue:** JobDetailEventsResponse uses `Record<string, unknown>` which TanStack Start rejects as non-serializable
- **Fix:** Cast return type to `Record<string, {}>` to satisfy serialization validation
- **Commit:** 11670d1

**4. [Rule 3 - Blocking] Added vite-env.d.ts for CSS ?url import**
- **Found during:** Task 2
- **Issue:** `import appCss from '~/styles.css?url'` fails tsc without Vite type declarations
- **Fix:** Created src/vite-env.d.ts with `/// <reference types="vite/client" />` and CSS module declaration
- **Commit:** 11670d1

**5. [Rule 2 - Missing Critical] app.tsx not needed — QueryClient in root route**
- **Found during:** Task 3
- **Issue:** Plan requested separate app.tsx with QueryClientProvider, but TanStack Start auto-generates app entry
- **Fix:** Integrated QueryClientProvider directly in __root.tsx root component
- **Commit:** 3db7388

## Verification Results

- `cd web && pnpm install` — clean install, all dependencies resolved
- `cd web && pnpm dev` — Vite dev server starts on port 3100 in <1s
- `cd web && npx tsc --noEmit` — zero TypeScript errors
- `npx vitest run` from root — 970/970 tests pass (no regressions)
- 5 server functions exported from server-fns.ts
- SSE hook exported from sse.ts
- Index route loads data via server function loader

## Key Design Decisions

1. **Separate web/ subproject**: Own package.json, tsconfig, and node_modules — does NOT pollute the parent pilot CLI project. Server functions bridge to parent code via `@pilot/*` path alias.

2. **Server function boundary**: TanStack Start's compiler enforces that server functions run only on Node.js. Client code cannot accidentally import better-sqlite3 or pilot DB modules.

3. **Coss UI as sole component provider**: 53 components installed via shadcn CLI with @coss/style preset. Full neutral color system with dark/light variants. Components use Base UI primitives under the hood.

4. **QueryClient in root route**: Instead of a separate app.tsx, the QueryClient lives in __root.tsx. This is the TanStack Start convention — the framework auto-generates its own app entry point.

5. **CSS ?url import pattern**: TanStack Start uses `?url` suffix for stylesheet imports in SSR mode. The URL is injected as a `<link>` tag in the head, ensuring proper SSR hydration.

## Next Phase Readiness

This plan delivers the complete web scaffold that Plan 03 will build upon:
- Server functions ready for all 5 query backbone operations
- SSE polling hook ready for live updates
- Coss UI components ready for job detail, session activity, and sub-agent views
- Router infrastructure ready for additional file-based routes
