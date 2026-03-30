---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
verified: 2026-03-22T00:41:32Z
status: gaps_found
score: 16/19 must-haves verified
gaps:
  - truth: "Sticky headers display high-signal synthesized fields (stage, verdict, model, status counters)"
    status: partial
    reason: "Verdict is synthesized but not rendered in sticky headers."
    artifacts:
      - path: "web/src/components/step-content-pane.tsx"
        issue: "Uses stage/model/statusCounters/hasSummary, but never renders synth.verdict."
      - path: "web/src/lib/step-semantics.ts"
        issue: "synthesizeHeaderFields exposes verdict, but downstream sticky header does not consume it."
    missing:
      - "Render synthesized verdict in sticky step header (badge/text) for judge/verification groups."
  - truth: "Phase 86 requirement IDs are cross-referenced in REQUIREMENTS.md"
    status: failed
    reason: "All Phase 86 IDs from PLAN frontmatter are absent from .planning/REQUIREMENTS.md."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "No TOK86/GRACE86/NAV86/PROJ86/STICK86/SUMM86/RT86 entries present."
    missing:
      - "Add definitions and phase mapping entries for TOK86-01..03, GRACE86-01..02, NAV86-01..02, PROJ86-01, STICK86-01..04, SUMM86-01..02, RT86-01..07."
---

# Phase 86: Pilot Web UI - Realtime, Navigation, Header Hierarchy, and Observability Polish Verification Report

**Phase Goal:** Make the Pilot web UI feel more realtime, more trustworthy, and more informative - especially around live sessions, navigation, sticky headers, grace period visibility, and token observability. Inline subsession nesting replaces the separate drill-in model, sticky headers get a fuller hierarchy rework with synthesized high-signal fields, and token accounting is fixed across all providers.
**Verified:** 2026-03-22T00:41:32Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Token counts show correct non-zero values for Anthropic/Claude provider sessions | VERIFIED | Token extraction reads nested cache format in `src/core/opencode-db.ts:771`; Anthropic nested-cache test passes in `test/core/opencode-db.test.ts:1087`. |
| 2 | Token counts show correct non-zero values for OpenAI/GPT provider sessions | VERIFIED | OpenAI nested-cache extraction path in `src/core/opencode-db.ts:771`; OpenAI nested-cache test passes in `test/core/opencode-db.test.ts:1105`. |
| 3 | Grace period state is clearly visible and distinguishable in the job list | VERIFIED | Dedicated warning grace badge with pulse + tooltip in `web/src/components/job-list.tsx:38` and replacement logic in `web/src/components/job-list.tsx:227`. |
| 4 | Users can tell when a job is intentionally waiting in grace vs stuck/idle | VERIFIED | Grace label/countdown and explanatory tooltip text in `web/src/components/job-list.tsx:45` and `web/src/components/job-list.tsx:49`; pending badge is replaced while grace active in `web/src/components/job-list.tsx:381`. |
| 5 | Dashboard tab bar does not overflow horizontally on mobile (375px viewport) | UNCERTAIN | Overflow containment classes exist in `web/src/routes/index.tsx:131`, but viewport behavior needs manual UI validation. |
| 6 | Sessions tab is either removed/merged or reframed to be genuinely useful | VERIFIED | Tabs reduced to Active/Queued/Recent/Projects in `web/src/routes/index.tsx:133`; no Sessions panel remains. |
| 7 | Projects page shows richer project information and feels like a control surface | VERIFIED | Card grid + summary counters + richer metadata in `web/src/components/projects-list.tsx:21`, `web/src/components/projects-list.tsx:46`, `web/src/components/projects-list.tsx:151`. |
| 8 | Sticky headers show meaningfully different information at each hierarchy level | VERIFIED | Two-row sticky step headers with contextual fields in `web/src/components/step-content-pane.tsx:280`; nested branch cards are separate, indented components in `web/src/components/branch-lifecycle-block.tsx:116`. |
| 9 | Sticky headers display high-signal synthesized fields (stage, verdict, model, status counters) | FAILED | `synthesizeHeaderFields` computes `verdict` in `web/src/lib/step-semantics.ts:176`, but sticky header never renders `synth.verdict` in `web/src/components/step-content-pane.tsx`. |
| 10 | Sticky headers have improved visual separation between levels | VERIFIED | Step headers use `sticky top-0`, blur, and type-colored bottom borders in `web/src/components/step-content-pane.tsx:280`; nested branch blocks have separate border/indent visual language in `web/src/components/branch-lifecycle-block.tsx:118`. |
| 11 | Clicking summary in a step navigates/scrolls to relevant summary content | VERIFIED | Summary target ids in `web/src/components/step-content-pane.tsx:358`; sidebar deep-link scroll in `web/src/components/step-timeline-sidebar.tsx:341`; header deep-link scroll in `web/src/components/step-content-pane.tsx:314`. |
| 12 | Child/sub-sessions display inline within execution tree, not on separate pages | VERIFIED | Fork cards render inline via timeline renderer in `web/src/components/timeline-stream.tsx:213`; old route is redirect-only in `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx:12`. |
| 13 | Child sessions update live with the same polling intent as parent | VERIFIED | Active child sessions poll every 3s via `refetchInterval` in `web/src/components/session-activity.tsx:56`; parent detail also polls active jobs in `web/src/routes/jobs.$jobId.tsx:25`. |
| 14 | Subsession nesting is collapsible with intentional default expand/collapse behavior | VERIFIED | Controlled collapsible state with depth-based default open in `web/src/components/branch-lifecycle-block.tsx:101` and recursive rendering in `web/src/components/branch-lifecycle-block.tsx:198`. |
| 15 | Multi-level nesting is readable on mobile without horizontal overflow | UNCERTAIN | Mobile indent reduction and overflow guards exist in `web/src/components/branch-lifecycle-block.tsx:111` and `web/src/components/session-activity.tsx:86`, but readability needs manual viewport test. |
| 16 | Old session drill-in route is cleaned up or redirects to inline view | VERIFIED | Route performs `beforeLoad` redirect to parent job in `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx:12`. |
| 17 | A clear SUMMARY.md exists covering all 7 areas of Phase 86 changes | VERIFIED | Seven explicit area sections present in `.planning/phases/86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish/86-05-SUMMARY.md:91`. |
| 18 | All web UI builds pass after all changes | VERIFIED | `npm run build` in `web/` succeeded during verification (client + SSR build complete). |
| 19 | All existing tests pass after all changes | VERIFIED | `npm test --run` executed; Vitest reported 61/61 files and 1277/1277 tests passing. |

**Score:** 16/19 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/opencode-db.ts` | Fixed token extraction for all providers | VERIFIED | Multi-path token extraction for nested + legacy paths in `src/core/opencode-db.ts:768` and `src/core/opencode-db.ts:845`; consumed by observability layer. |
| `web/src/components/job-list.tsx` | Prominent grace period badge | VERIFIED | Grace badge warning/pulse/tooltip + replacement logic in `web/src/components/job-list.tsx:38` and `web/src/components/job-list.tsx:381`. |
| `web/src/routes/index.tsx` | Mobile-safe tabs + sessions reframe | VERIFIED | Scrollable TabsList wrapper and 4-tab layout in `web/src/routes/index.tsx:131`. |
| `web/src/components/projects-list.tsx` | Rich card-based projects control surface | VERIFIED | 158-line card-grid implementation with summary + empty-state command in `web/src/components/projects-list.tsx:130`. |
| `web/src/components/step-timeline-sidebar.tsx` | Differentiated sidebar step metadata + summary deep-link | VERIFIED | Navigation rows include status/source/duration and summary-jump trigger in `web/src/components/step-timeline-sidebar.tsx:321` and `web/src/components/step-timeline-sidebar.tsx:335`. |
| `web/src/components/step-content-pane.tsx` | Sticky step headers with synthesized high-signal fields + summary scroll-to | PARTIAL | Sticky hierarchy and summary scroll are implemented, but synthesized `verdict` field is not rendered. |
| `web/src/lib/step-semantics.ts` | Header field synthesis helper | VERIFIED | `SynthesizedHeaderFields` + `synthesizeHeaderFields` exported in `web/src/lib/step-semantics.ts:128` and `web/src/lib/step-semantics.ts:153`. |
| `web/src/components/branch-lifecycle-block.tsx` | Inline collapsible subsession rendering | VERIFIED | Collapsible inline recursion, lazy child loading, and depth defaults implemented in `web/src/components/branch-lifecycle-block.tsx:122`. |
| `web/src/components/session-activity.tsx` | Live polling for inline subsessions | VERIFIED | `isActive` prop and polling interval logic in `web/src/components/session-activity.tsx:44` and `web/src/components/session-activity.tsx:56`. |
| `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` | Old drill-in route redirect cleanup | VERIFIED | Redirect-only route contract in `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx:11`. |
| `.planning/phases/86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish/86-05-SUMMARY.md` | Comprehensive phase summary | VERIFIED | File exists and includes all seven required area sections. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/core/job-observability.ts` | `src/core/opencode-db.ts` | `getSessionTokenUsageByModelRecursive` | WIRED | Imported and called in `src/core/job-observability.ts:6` and `src/core/job-observability.ts:145`. |
| `web/src/components/job-list.tsx` | `web/src/lib/server-fns.ts` | `getGraceConfigFn` / `queueGraceSeconds` | PARTIAL | Grace config is wired indirectly via route: `getGraceConfigFn` in `web/src/routes/index.tsx:61`, then prop flow into `JobList` at `web/src/routes/index.tsx:160`. |
| `web/src/routes/index.tsx` | `web/src/components/projects-list.tsx` | `ProjectsList` import | WIRED | Import and render in `web/src/routes/index.tsx:10` and `web/src/routes/index.tsx:179`. |
| `web/src/components/step-content-pane.tsx` | `web/src/lib/step-semantics.ts` | `synthesizeHeaderFields` import | WIRED | Import + use in `web/src/components/step-content-pane.tsx:21` and `web/src/components/step-content-pane.tsx:276`. |
| `web/src/components/branch-lifecycle-block.tsx` | `web/src/components/session-activity.tsx` | Inline `SessionActivity` rendering | WIRED | Import and render in `web/src/components/branch-lifecycle-block.tsx:16` and `web/src/components/branch-lifecycle-block.tsx:189`. |
| `web/src/components/branch-lifecycle-block.tsx` | `web/src/lib/server-fns.ts` | `getSessionChildrenFn` | WIRED | Lazy nested-child query in `web/src/components/branch-lifecycle-block.tsx:107`. |

### Requirements Coverage

All requirement IDs declared in PLAN frontmatter were accounted for and cross-checked against `.planning/REQUIREMENTS.md`. None are currently defined there.

| Requirement | Source Plan | Description in REQUIREMENTS.md | Status | Evidence |
| --- | --- | --- | --- | --- |
| TOK86-01 | `86-01-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; implementation evidence in `src/core/opencode-db.ts:768`. |
| TOK86-02 | `86-01-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; implementation evidence in `src/core/opencode-db.ts:845`. |
| TOK86-03 | `86-01-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; recursive aggregation present in `src/core/opencode-db.ts:887`. |
| GRACE86-01 | `86-01-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; grace badge present in `web/src/components/job-list.tsx:43`. |
| GRACE86-02 | `86-01-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; grace tooltip and replacement semantics in `web/src/components/job-list.tsx:49` and `web/src/components/job-list.tsx:381`. |
| NAV86-01 | `86-02-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; overflow-safe tab bar in `web/src/routes/index.tsx:131`. |
| NAV86-02 | `86-02-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; sessions tab removed in `web/src/routes/index.tsx:133`. |
| PROJ86-01 | `86-02-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; projects card grid in `web/src/components/projects-list.tsx:151`. |
| STICK86-01 | `86-03-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; sticky hierarchy implementation in `web/src/components/step-content-pane.tsx:280`. |
| STICK86-02 | `86-03-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; partial implementation due missing sticky verdict render. |
| STICK86-03 | `86-03-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; colored border differentiation in `web/src/components/step-content-pane.tsx:59`. |
| STICK86-04 | `86-03-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; summary deep-link wiring in sidebar/header click handlers. |
| SUMM86-01 | `86-03-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; summary deep-link target ids in `web/src/components/step-content-pane.tsx:358`. |
| SUMM86-02 | `86-05-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; 7-area summary present in phase summary file. |
| RT86-01 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; inline branch rendering via `TimelineItemRenderer` in `web/src/components/timeline-stream.tsx:213`. |
| RT86-02 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; active session polling in `web/src/components/session-activity.tsx:56`. |
| RT86-03 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; depth-based default collapse/expand in `web/src/components/branch-lifecycle-block.tsx:101`. |
| RT86-04 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; mobile overflow guards in `web/src/components/branch-lifecycle-block.tsx:118`. |
| RT86-05 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; redirect route in `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx:12`. |
| RT86-06 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; no component links to old session drill-in path in current UI components. |
| RT86-07 | `86-04-PLAN.md` | Missing | BLOCKED | ID not found in `.planning/REQUIREMENTS.md`; branch recursion + live inline session activity in `web/src/components/branch-lifecycle-block.tsx:195`. |

Orphaned requirements (mapped to Phase 86 in REQUIREMENTS.md but not claimed in plan frontmatter): none (no Phase 86 mapping present).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `web/src/components/session-overview.tsx` | 204 | Unused component after Sessions tab removal | WARNING | Dead code increases maintenance cost and can drift from current UX model. |
| `web/src/components/branch-lifecycle-block.helpers.ts` | 79 | Legacy drill-in path helper retained | INFO | `getBranchDrillInPath()` targets deprecated route shape; currently not used by runtime components. |

### Human Verification Required

### 1. Dashboard Mobile Overflow

**Test:** Open dashboard at 375px and 320px widths; inspect tab strip while switching tabs.
**Expected:** No page-level horizontal overflow; tabs remain usable via horizontal tab-strip scrolling only.
**Why human:** CSS class presence is verifiable, but real layout overflow depends on rendered font metrics and browser behavior.

### 2. Nested Subsession Mobile Readability

**Test:** Open a job with 3+ nested child sessions on a mobile viewport and expand multiple levels.
**Expected:** No page-level horizontal overflow; nested cards remain readable and intentionally indented.
**Why human:** Readability and clipping behavior under real content cannot be fully proven by static code inspection.

### 3. Sticky Header Visual Hierarchy

**Test:** Scroll through mixed execution/judge/gap-closure timeline sections and compare step headers vs nested branch cards.
**Expected:** Step headers remain dominant and visually distinct; branch-level elements feel subordinate.
**Why human:** Visual hierarchy quality is subjective and requires rendered UI assessment.

### Gaps Summary

Implementation is largely present and wired end-to-end (token accounting, grace visibility, navigation cleanup, inline subsession nesting, redirect cleanup, build/tests green). Two blockers remain:

1. Sticky header high-signal synthesis is incomplete: verdict is synthesized but not surfaced in the sticky header itself.
2. Requirements traceability is not satisfiable against `.planning/REQUIREMENTS.md` because all Phase 86 IDs are missing there.

---

_Verified: 2026-03-22T00:41:32Z_
_Verifier: Claude (gsd-verifier)_
