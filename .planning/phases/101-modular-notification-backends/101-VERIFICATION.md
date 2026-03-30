---
phase: 101-modular-notification-backends
verified: 2026-03-30T12:53:26Z
status: passed
score: 29/29 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 24/29
  gaps_closed:
    - "Project.owner references replaced with notifyRoutes lookups"
    - "pilot init auto-detects available backends and offers selection"
    - "pilot add tests cover multi-backend flag combinations and pilot notify tests cover list/enable/disable"
    - "All existing tests pass (no regressions)"
    - "Phase 101 requirement IDs are accounted for in REQUIREMENTS.md"
  gaps_remaining: []
  regressions: []
---

# Phase 101: Modular Notification Backends Verification Report

**Phase Goal:** Replace hardcoded OpenClaw notification with a modular backend system - typed backend interface, 4 built-in backends (kimaki, openclaw, webhook, telegram), fan-out delivery, `pilot notify` CLI subcommand, multi-backend `pilot add` flags, project route management, `pilot init` auto-detection, config schema update, owner removal, and comprehensive tests.
**Verified:** 2026-03-30T12:53:26Z
**Status:** passed
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | NotifyBackend interface exists with deliver/detect/validateConfig methods | ✓ VERIFIED | `src/core/notify-backends/types.ts:23` defines the interface and `NotifyRoute` union. |
| 2 | All four backends implement NotifyBackend correctly | ✓ VERIFIED | Implementations exist in `src/core/notify-backends/kimaki.ts:12`, `src/core/notify-backends/openclaw.ts:11`, `src/core/notify-backends/webhook.ts:23`, and `src/core/notify-backends/telegram.ts:33`; `test/core/notify-backends/backends.test.ts` passes in targeted and full runs. |
| 3 | Registry can look up backends by kind and list enabled backends from config | ✓ VERIFIED | Registry helpers exist in `src/core/notify-backends/registry.ts:87`, `src/core/notify-backends/registry.ts:94`, `src/core/notify-backends/registry.ts:102`, `src/core/notify-backends/registry.ts:117`, and `src/core/notify-backends/registry.ts:147`. |
| 4 | OpenClaw backend behavior is identical to existing openclaw-deliver.ts | ✓ VERIFIED | OpenClaw execa arg construction matches the legacy shape in `src/core/notify-backends/openclaw.ts:20`; regression covered at `test/core/notify-backends/backends.test.ts:126`. |
| 5 | notifyJobCompletion fans out to multiple backends via Promise.allSettled | ✓ VERIFIED | Fan-out happens in `src/core/callback.ts:183`; success/failure permutations are covered in `test/core/callback.test.ts:112`. |
| 6 | resolveNotifyRoutes returns NotifyRoute[] (not single route) | ✓ VERIFIED | `src/core/notify-route.ts:45` returns `NotifyRoute[]`, and resolver tests cover the array contract in `test/core/notify-route.test.ts:69`. |
| 7 | Job.notifyRoute stores NotifyRoute[] \| null | ✓ VERIFIED | `src/core/types.ts:159` types `Job.notifyRoute` as `NotifyRoute[] | null`; DB serialization uses arrays at `src/core/db.ts:866` and `src/core/db.ts:891`. |
| 8 | Project.notifyRoutes stores NotifyRoute[] \| null | ✓ VERIFIED | `src/core/types.ts:390` and `src/core/types.ts:405` type project notify routes as arrays; DB row mapping populates them at `src/core/db.ts:300`. |
| 9 | Legacy single-object routes are wrapped in arrays transparently | ✓ VERIFIED | `src/core/db.ts:290` wraps legacy single objects into arrays; resolver tests cover legacy fallback at `test/core/notify-route.test.ts:92`. |
| 10 | Delivery ignores enabled/disabled list - if job has route, backend fires | ✓ VERIFIED | `src/core/callback.ts:174` resolves routes directly and `src/core/callback.ts:183` fans out without checking enabled backend config. |
| 11 | Old openclaw-deliver.ts is deleted, all imports point to notify-backends/openclaw.ts | ✓ VERIFIED | `src/core/openclaw-deliver.ts` is absent, and OpenClaw delivery lives in `src/core/notify-backends/openclaw.ts:11`. |
| 12 | pilot add supports --notify-kimaki, --notify-webhook, --notify-telegram flags | ✓ VERIFIED | CLI flags are registered in `src/index.ts:55`, `src/index.ts:57`, and `src/index.ts:58`; handling lives in `src/commands/add.ts:313`. |
| 13 | Multiple --notify-* flags produce combined NotifyRoute array | ✓ VERIFIED | Route accumulation is implemented in `src/commands/add.ts:313` through `src/commands/add.ts:328`; multi-flag tests exist at `test/commands/add.test.ts:774`, `test/commands/add.test.ts:793`, and `test/commands/add.test.ts:814`. |
| 14 | pilot add errors when enabled backend has no route and no default | ✓ VERIFIED | Missing-target validation is implemented in `src/commands/add.ts:331` through `src/commands/add.ts:383`; tests cover failure/default fallback at `test/commands/add.test.ts:833` and `test/commands/add.test.ts:854`. |
| 15 | --no-notify stores empty array, skipping all notification | ✓ VERIFIED | Explicit empty-array path exists at `src/commands/add.ts:309`; covered by `test/commands/add.test.ts:699`. |
| 16 | pilot project supports --notify-kimaki-channel, --notify-webhook, --notify-telegram, --clear-notify | ✓ VERIFIED | Flags are registered in `src/index.ts:205` through `src/index.ts:208`; route management is implemented at `src/commands/project.ts:78` through `src/commands/project.ts:119`. |
| 17 | All --owner flags are hard removed from CLI | ✓ VERIFIED | No `--owner` flag remains anywhere under `src/`; current add/project registrations in `src/index.ts:44` through `src/index.ts:60` and `src/index.ts:200` through `src/index.ts:209` expose only notify-route options. |
| 18 | Project.owner references replaced with notifyRoutes lookups | ✓ VERIFIED | `src/core/types.ts:388` through `src/core/types.ts:413` no longer expose owner on `Project` or `ProjectWithStats`; `src/core/job-detail-query.ts:1131` and `src/core/job-detail-query.ts:1166` return `notifyRoutes`; `src/tui/components/projects-panel.tsx:39` and `src/tui/components/projects-panel.tsx:55` now show notify summaries instead of owner. |
| 19 | pilot notify list shows all backends with status and detection | ✓ VERIFIED | `src/commands/notify.ts:36` implements list output; `npx tsx src/index.ts --json notify list` returned all four backends with detection states. |
| 20 | pilot notify enable/disable writes to config and validates | ✓ VERIFIED | Validation and enable/disable flows are implemented in `src/commands/notify.ts:100` through `src/commands/notify.ts:128`; covered by `test/commands/notify.test.ts:155` through `test/commands/notify.test.ts:215`. |
| 21 | pilot notify test sends a test notification through a backend | ✓ VERIFIED | `src/commands/notify.ts:132` builds synthetic routes/jobs and calls `backend.deliver()`; covered by `test/commands/notify.test.ts:272`. |
| 22 | pilot notify config reads/writes backend-specific config | ✓ VERIFIED | Config get/set flow exists in `src/commands/notify.ts:194` through `src/commands/notify.ts:248`; command tests cover reads/writes at `test/commands/notify.test.ts:220`, and registry persistence is covered at `test/core/notify-backends/registry.test.ts:211`. |
| 23 | pilot init auto-detects available backends and offers selection | ✓ VERIFIED | Detection loop exists at `src/commands/init.ts:216`; interactive selection prompt and enable loop exist at `src/commands/init.ts:244` through `src/commands/init.ts:277`; non-interactive auto-detection path is covered by `test/commands/init.test.ts:74`. |
| 24 | Web UI displays project.notifyRoutes instead of project.owner | ✓ VERIFIED | Notify-route rendering exists in `web/src/components/settings/section-projects.tsx:112`, `web/src/components/projects-list.tsx:78`, and `web/src/routes/projects.$projectPath.tsx:128`. |
| 25 | resolveNotifyRoutes tests cover all route resolution scenarios | ✓ VERIFIED | `test/core/notify-route.test.ts:69` through `test/core/notify-route.test.ts:147` cover job routes, project fallback, callbackSessionKey fallback, empty routes, precedence, and null project. |
| 26 | pilot add tests cover multi-backend flag combinations | ✓ VERIFIED | `test/commands/add.test.ts:741` through `test/commands/add.test.ts:899` cover 2-route combos, 3-route combos, missing-target errors, and defaults. |
| 27 | pilot notify tests cover list/enable/disable | ✓ VERIFIED | `test/commands/notify.test.ts:100` through `test/commands/notify.test.ts:215` cover list, enable, and disable flows, with additional config/test coverage in the same file. |
| 28 | callback fan-out tests cover multi-backend success/fail | ✓ VERIFIED | `test/core/callback.test.ts:112` through `test/core/callback.test.ts:216` cover all-success, partial-failure, all-failure, thrown-backend, and unknown-backend scenarios. |
| 29 | All existing tests pass (no regressions) | ✓ VERIFIED | `npx vitest run` passed: 70 files, 1471 tests, 0 failures; `test/core/runner-debug-lane.test.ts` now passes all 18 tests. |

**Score:** 29/29 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/notify-backends/types.ts` | Backend interface + route/result types | ✓ VERIFIED | Exists, substantive, and imported across registry/callback/db code paths. |
| `src/core/notify-backends/registry.ts` | Backend lookup + config-backed enable/disable | ✓ VERIFIED | Exists, substantive, and wired to config file reads/writes. |
| `src/core/notify-backends/kimaki.ts` | Kimaki backend | ✓ VERIFIED | Exists, substantive, registered, and covered by backend tests. |
| `src/core/notify-backends/openclaw.ts` | OpenClaw backend | ✓ VERIFIED | Exists, substantive, registered, and legacy behavior is regression-tested. |
| `src/core/notify-backends/webhook.ts` | Webhook backend | ✓ VERIFIED | Exists, substantive, and uses real fetch-based delivery. |
| `src/core/notify-backends/telegram.ts` | Telegram backend | ✓ VERIFIED | Exists, substantive, and validates config from nested/legacy config paths. |
| `src/core/notify-route.ts` | Array-based route resolution | ✓ VERIFIED | Exists, substantive, and wired into callback delivery. |
| `src/core/callback.ts` | Fan-out notification delivery | ✓ VERIFIED | Exists, substantive, and wired to resolver + registry. |
| `src/core/types.ts` | Updated notify route and config schema types | ✓ VERIFIED | `Job`, `Project`, `ProjectWithStats`, and `ConfigFileSchema` all reflect the modular backend model. |
| `src/core/db.ts` | DB migration + route serialization | ✓ VERIFIED | Adds `notify_routes`, migrates legacy owner data, and serializes/deserializes route arrays. |
| `src/commands/add.ts` | Multi-backend add flags | ✓ VERIFIED | Combines flags, validates enabled backends, and persists notify route arrays. |
| `src/commands/project.ts` | Project route management | ✓ VERIFIED | Supports route updates, clear flow, and JSON/human output. |
| `src/commands/notify.ts` | `pilot notify` subcommands | ✓ VERIFIED | Implements list, enable, disable, test, and config flows. |
| `src/commands/init.ts` | Init detection + selection | ✓ VERIFIED | Detects available backends, auto-enables in `--yes`, and prompts for interactive selection. |
| `src/tui/components/projects-panel.tsx` | Owner-free TUI projects panel | ✓ VERIFIED | Empty-state hint and detail rows now use notify routes, not owner. |
| `web/src/components/settings/section-projects.tsx` | Settings projects list shows notifications | ✓ VERIFIED | Renders `notifyRoutes` labels and no owner field. |
| `web/src/components/projects-list.tsx` | Project cards show notification badges | ✓ VERIFIED | Renders route badges and owner-free empty state. |
| `web/src/routes/projects.$projectPath.tsx` | Project detail page shows notifications | ✓ VERIFIED | Renders per-route detail lines and no owner field. |
| `test/commands/notify.test.ts` | Notify command suite | ✓ VERIFIED | Exists, substantive (342 lines), and covers all subcommands. |
| `test/commands/add.test.ts` | Add command multi-backend coverage | ✓ VERIFIED | Contains dedicated multi-backend describe block and default-validation coverage. |
| `test/core/runner-debug-lane.test.ts` | Debug-lane regression coverage | ✓ VERIFIED | Mock exports are fixed and all 18 tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/notify-backends/registry.ts` | `src/core/config.ts` | `loadConfigFile()` | ✓ WIRED | Registry reads config at `src/core/notify-backends/registry.ts:103` and writes back with cache reset at `src/core/notify-backends/registry.ts:79`. |
| `src/core/notify-backends/openclaw.ts` | `execa` | `execa('openclaw', args)` | ✓ WIRED | OpenClaw backend shells out via `src/core/notify-backends/openclaw.ts:31`. |
| `src/core/callback.ts` | `src/core/notify-backends/registry.ts` | `getBackend(route.kind)` | ✓ WIRED | Registry lookup happens at `src/core/callback.ts:185`. |
| `src/core/callback.ts` | `src/core/notify-route.ts` | `resolveNotifyRoutes(job, project)` | ✓ WIRED | Resolver call exists at `src/core/callback.ts:174`. |
| `src/core/db.ts` | `src/core/notify-backends/types.ts` | `NotifyRoute` parsing/serialization | ✓ WIRED | DB parsing uses `parseNotifyRoutes()` at `src/core/db.ts:290`; job insert serializes arrays at `src/core/db.ts:891`. |
| `src/commands/add.ts` | `src/core/notify-backends/registry.ts` | `getEnabledBackends()/getBackendConfig()` | ✓ WIRED | Validation/default routing exists at `src/commands/add.ts:333` through `src/commands/add.ts:369`. |
| `src/commands/add.ts` | `src/core/db.ts` | `addJob(...notifyRoutes)` | ✓ WIRED | Route arrays are persisted at `src/commands/add.ts:413` through `src/commands/add.ts:427`. |
| `src/commands/project.ts` | `src/core/db.ts` | `updateProjectNotifyRoutes()` | ✓ WIRED | Project route management writes through DB at `src/commands/project.ts:80` and `src/commands/project.ts:110`. |
| `src/commands/notify.ts` | `src/core/notify-backends/registry.ts` | list/enable/disable/config helpers | ✓ WIRED | Registry helpers are imported and used throughout `src/commands/notify.ts:8` through `src/commands/notify.ts:16`. |
| `src/commands/init.ts` | `src/core/notify-backends/registry.ts` | `getAllBackends().detect()` + `enableBackend()` | ✓ WIRED | Detection loop starts at `src/commands/init.ts:217`; enable calls occur at `src/commands/init.ts:238` and `src/commands/init.ts:274`. |
| `src/tui/views/dashboard.tsx` | `src/tui/data/pilot-db.ts` | `projects={s.projects()}` | ✓ WIRED | Dashboard passes project data to the fixed TUI component at `src/tui/views/dashboard.tsx:93`; data source comes from `src/tui/data/pilot-db.ts:41`. |
| `web/src/components/settings/section-projects.tsx` | `src/core/job-detail-query.ts` | server fns returning `notifyRoutes` | ✓ WIRED | Web settings component renders `notifyRoutes`, and project DTOs return them at `src/core/job-detail-query.ts:1137` and `src/core/job-detail-query.ts:1173`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `src/core/callback.ts` | `routes` | `resolveNotifyRoutes(job, project)` from job/project DB records | Yes | ✓ FLOWING |
| `src/tui/components/projects-panel.tsx` | `project.notifyRoutes` | `src/tui/views/dashboard.tsx:93` -> `src/tui/data/pilot-db.ts:41` -> `getAllProjects()` -> `src/core/db.ts:300` | Yes | ✓ FLOWING |
| `web/src/components/settings/section-projects.tsx` | `project.notifyRoutes` | web server functions -> `getProjectsWithStats()` -> `src/core/job-detail-query.ts:1137` | Yes | ✓ FLOWING |
| `web/src/routes/projects.$projectPath.tsx` | `project.notifyRoutes` | project detail server function -> `getProjectDetail()` -> `src/core/job-detail-query.ts:1173` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| `pilot notify` lists all backends | `npx tsx src/index.ts --json notify list` | Returned 4 backends with expected kinds and detection states | ✓ PASS |
| `pilot add` exposes modular notify flags | `npx tsx src/index.ts add --help` | Help shows `--notify-kimaki`, `--notify-webhook`, `--notify-telegram`, and `--no-notify` | ✓ PASS |
| Gap-closure tests pass | `npx vitest run test/core/runner-debug-lane.test.ts test/commands/notify.test.ts test/commands/add.test.ts test/commands/init.test.ts` | 97/97 tests passed | ✓ PASS |
| Full suite is regression-free | `npx vitest run` | 70 files, 1471 tests passed, 0 failed | ✓ PASS |
| TypeScript compiles | `npx tsc --noEmit && node -e "console.log('OK')"` | `OK` | ✓ PASS |

### Requirements Coverage

All 18 `NBACK-*` IDs declared across Phase 101 plan frontmatter now exist in `.planning/REQUIREMENTS.md`, and each maps to Phase 101. No orphaned Phase 101 requirements were found.

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `NBACK-TYPES` | `101-01` | NotifyBackend interface and route/result types | ✓ SATISFIED | `src/core/notify-backends/types.ts:8` through `src/core/notify-backends/types.ts:41`. |
| `NBACK-REGISTRY` | `101-01` | Registry helpers and config-backed enable/disable | ✓ SATISFIED | `src/core/notify-backends/registry.ts:87` through `src/core/notify-backends/registry.ts:183`; registry tests pass. |
| `NBACK-KIMAKI` | `101-01` | Kimaki backend implementation | ✓ SATISFIED | `src/core/notify-backends/kimaki.ts:12`; backend tests cover session/channel routing. |
| `NBACK-OPENCLAW` | `101-01` | OpenClaw backend extracted to modular system | ✓ SATISFIED | `src/core/notify-backends/openclaw.ts:11`; old `src/core/openclaw-deliver.ts` is gone. |
| `NBACK-WEBHOOK` | `101-01` | Webhook backend implementation | ✓ SATISFIED | `src/core/notify-backends/webhook.ts:23`; fetch-based delivery is tested. |
| `NBACK-TELEGRAM` | `101-01` | Telegram backend implementation | ✓ SATISFIED | `src/core/notify-backends/telegram.ts:33`; detect/validate/deliver paths are tested. |
| `NBACK-ROUTE-REFACTOR` | `101-02` | `resolveNotifyRoutes()` array return and refactor | ✓ SATISFIED | `src/core/notify-route.ts:45`; resolver tests pass. |
| `NBACK-CALLBACK-FANOUT` | `101-02` | Fan-out delivery with success if any backend succeeds | ✓ SATISFIED | `src/core/callback.ts:183` through `src/core/callback.ts:203`; callback tests cover success/failure permutations. |
| `NBACK-TYPE-CHANGES` | `101-02` | Job/project types updated to route arrays | ✓ SATISFIED | `src/core/types.ts:159`, `src/core/types.ts:390`, `src/core/types.ts:405`. |
| `NBACK-DB-MIGRATION` | `101-02` | `notify_routes` DB migration and legacy owner migration | ✓ SATISFIED | `src/core/db.ts:727` through `src/core/db.ts:743`; row parsing/serialization also updated. |
| `NBACK-CONFIG-SCHEMA` | `101-02` | Nested notifications config schema | ✓ SATISFIED | `src/core/types.ts:17` through `src/core/types.ts:58`; registry config read/write tests pass. |
| `NBACK-ADD-INTEGRATION` | `101-03`, `101-08` | Modular notify flags, fan-out, validation, defaults | ✓ SATISFIED | `src/index.ts:55` through `src/index.ts:60`, `src/commands/add.ts:305` through `src/commands/add.ts:427`, `test/commands/add.test.ts:741`. |
| `NBACK-PROJECT-INTEGRATION` | `101-03` | Project route management flags | ✓ SATISFIED | `src/index.ts:205` through `src/index.ts:208`; `src/commands/project.ts:78` through `src/commands/project.ts:119`. |
| `NBACK-OWNER-REMOVAL` | `101-03`, `101-06` | Remove owner from types/CLI/DTO/TUI and DB API | ✓ SATISFIED | `src/core/types.ts:388` through `src/core/types.ts:413` have no owner, `src/core/job-detail-query.ts:1131` through `src/core/job-detail-query.ts:1181` expose `notifyRoutes`, TUI no longer shows owner, and `registerProject(path)` is owner-free at `src/core/db.ts:1918`. |
| `NBACK-NOTIFY-CLI` | `101-04`, `101-08` | `pilot notify` list/enable/disable/test/config | ✓ SATISFIED | `src/commands/notify.ts:36` through `src/commands/notify.ts:248`, CLI wiring in `src/index.ts:372` through `src/index.ts:420`, and `test/commands/notify.test.ts` passes. |
| `NBACK-INIT-DETECTION` | `101-04`, `101-06` | Init detection, `--yes` auto-enable, interactive prompt | ✓ SATISFIED | `src/commands/init.ts:216` through `src/commands/init.ts:279`; `test/commands/init.test.ts` covers auto-detection in `--yes` mode and the interactive prompt code is present. |
| `NBACK-WEB-UI` | `101-05` | Web UI shows notify routes instead of owner | ✓ SATISFIED | `web/src/components/settings/section-projects.tsx:112`, `web/src/components/projects-list.tsx:78`, `web/src/routes/projects.$projectPath.tsx:128`. |
| `NBACK-TESTS` | `101-05`, `101-06`, `101-07`, `101-08` | Comprehensive backend/CLI/regression coverage | ✓ SATISFIED | Notify/add/debug-lane suites now exist and pass; full suite passed 1471/1471. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/commands/init.ts` | 268 | Validation warning does not short-circuit `enableBackend()` | ⚠ Warning | Interactive init can enable a backend even after warning that required config is missing; this does not block the phase goal, but it is worth tightening later. |
| `src/core/notify-route.ts` | 12 | Legacy comment still mentions `project.owner` | ℹ Info | Comment drift only; runtime logic now resolves `notifyRoutes` and `callbackSessionKey`. |
| `test/core/notify-route.test.ts` | 53 | Stale helper object still includes `owner: null` | ℹ Info | Test-only leftover field; runtime `Project` type and production code no longer expose owner. |

### Human Verification Required

None required for phase sign-off. The previous blockers are closed, the CLI surface is wired, and automated coverage is comprehensive.

### Gaps Summary

The five blockers from the previous verification are closed.

Owner removal is now complete in the places that previously failed: `Project` and `ProjectWithStats` no longer expose owner, job-detail query DTOs return `notifyRoutes`, and the TUI projects panel shows notify-route summaries with the stale `--owner` hint removed. The missing requirement traceability is also fixed: all 18 `NBACK-*` IDs now exist in `.planning/REQUIREMENTS.md` and map to Phase 101.

The testing gaps are also closed. `test/commands/notify.test.ts` now exists with list/enable/disable/config/test coverage, `test/commands/add.test.ts` now covers multi-backend combinations and enabled-backend default validation, `test/core/runner-debug-lane.test.ts` is fixed, and the full suite is green again.

The modular backend goal is therefore achieved: typed backends, registry/config wiring, fan-out delivery, CLI integration, project route management, init detection, owner-free UI surfaces, and comprehensive tests are all present and functioning in the codebase.

---

_Verified: 2026-03-30T12:53:26Z_
_Verifier: the agent (gsd-verifier)_
