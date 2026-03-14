---
phase: 085
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - docs/GETTING-STARTED.md
autonomous: true

must_haves:
  truths:
    - "README/docs clearly present the web UI as a real Pilot operator surface (not an experimental aside)"
    - "A new user can quickly understand what the web UI is for: dashboard triage, job detail inspection, and action execution"
    - "Docs explicitly mention merged step-aware timeline inspection and child/session drill-in detail flow"
    - "Docs mention remote/tunneled access pattern and narrow-screen/mobile follow-up usability"
    - "Copy is concise, product-oriented, and avoids overclaiming unshipped behavior"
  artifacts:
    - path: "README.md"
      provides: "Top-level product positioning and feature overview that includes web UI capabilities"
      contains: "Web UI|web dashboard|timeline|drill"
    - path: "docs/GETTING-STARTED.md"
      provides: "Operator usage guidance for launching and using the web UI, including remote/tunnel notes"
      contains: "web|tunnel|timeline|session"
  key_links:
    - from: "README.md web UI capability copy"
      to: "web/src/components/timeline-stream.tsx"
      via: "Merged step-aware timeline and lifecycle branch block behavior"
      pattern: "step|timeline|branch"
    - from: "README.md and docs/GETTING-STARTED.md drill-in copy"
      to: "web/src/routes/jobs.$jobId.sessions.$sessionId.tsx"
      via: "Child/session detail route and breadcrumb/back context"
      pattern: "sessions/\$sessionId|SessionActivity"
    - from: "docs/GETTING-STARTED.md launch/access instructions"
      to: "web/package.json and web/vite.config.ts"
      via: "Actual dev command and default port behavior"
      pattern: "dev|3100|host"
---

<objective>
Update user-facing docs so Pilot's current web UI is accurately represented as a meaningful operator surface, with concise guidance on what it does and how to use it.

Purpose: Recent phases shipped substantial web UI capabilities (dashboard, timeline/detail flow, child drill-in, action surfaces, mobile follow-up). README/docs currently undersell that reality.

Output: Concise, truthful README + getting-started updates that describe the web UI's value, core capabilities, and practical access patterns.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@README.md
@docs/GETTING-STARTED.md
@web/package.json
@web/vite.config.ts
@web/src/components/job-list.tsx
@web/src/components/session-overview.tsx
@web/src/components/timeline-stream.tsx
@web/src/components/branch-lifecycle-block.tsx
@web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
@.planning/phases/62-pilot-web-ui-phase-2-agent-frontend-merged-chronological-detail-flow-inline-subagent-cards-and-proactive-action-parity/62-03-SUMMARY.md
@.planning/phases/62-pilot-web-ui-phase-2-agent-frontend-merged-chronological-detail-flow-inline-subagent-cards-and-proactive-action-parity/62-04-SUMMARY.md
@.planning/phases/63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui/63-05-SUMMARY.md
@.planning/quick/083-pilot-web-ui-mobile-responsiveness-and-n/083-SUMMARY.md
@.planning/quick/084-quick-follow-up-subjob-navigation-must-r/084-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update README product framing to include shipped web UI capabilities</name>
  <files>README.md</files>
  <action>
Add a concise web UI-oriented update in README so the product story is no longer CLI/TUI-only.

Implementation requirements:
- Introduce or expand a feature section that explicitly frames the web UI as a real Pilot surface for operators.
- Describe these capabilities at high level (no implementation deep-dive):
  1) dashboard/overview for jobs and sessions,
  2) merged step-aware timeline/detail inspection,
  3) inline branch lifecycle handling with child/session drill-in,
  4) proactive action surfaces (command palette + contextual job actions).
- Keep copy product-oriented and concise (short paragraphs/bullets).
- Add one practical line that points users to the web app entry command/path, but do not expand into a full setup tutorial in README.
- Ensure wording reflects shipped behavior only; do NOT claim multi-user auth, role management, production deployment tooling, or other unshipped platform features.
  </action>
  <verify>
Review `git diff -- README.md` and confirm the updated README includes explicit web UI framing plus the four capability bullets/themes above. Confirm no speculative/unshipped claims were introduced.
  </verify>
  <done>
README clearly signals that Pilot has a meaningful web UI and communicates what operators can do there in concise, accurate language.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add concise web UI usage guidance in Getting Started (including remote/tunnel and narrow-screen notes)</name>
  <files>docs/GETTING-STARTED.md</files>
  <action>
Add or update a focused section in Getting Started that explains how operators should use the web UI in real workflows.

Implementation requirements:
- Add a short "Web UI" subsection in the usage flow that covers:
  1) how to start the web UI from the `web/` workspace,
  2) what to use it for (timeline/detail inspection and child/session drill-in),
  3) where action surfaces live (global command palette + job-level actions).
- Include a concise remote-access note for tunneled usage (for example, host binding + SSH tunnel pattern) aligned with the existing dev-server setup and default port.
- Add a brief narrow-screen/mobile note reflecting the recent follow-up responsiveness work, without overselling it as fully mobile-native.
- Keep this section compact and operator-facing; avoid architecture internals and long implementation narratives.
- Cross-check claims against referenced web components/routes and recent phase summaries before finalizing.
  </action>
  <verify>
Review `git diff -- docs/GETTING-STARTED.md` and confirm the new section includes launch guidance, timeline/drill-in usage, remote/tunnel note, and narrow-screen/mobile note in concise wording.
  </verify>
  <done>
Getting Started gives a new user practical, truthful guidance for using Pilot's web UI locally and remotely, including timeline/drill-in understanding and mobile/narrow-screen expectations.
  </done>
</task>

</tasks>

<verification>
- `git diff -- README.md docs/GETTING-STARTED.md` shows focused docs-only changes.
- `grep -n "Web UI\|web dashboard\|timeline\|drill" README.md docs/GETTING-STARTED.md` returns matches in both files.
- `grep -n "tunnel\|ssh -L\|--host\|3100" docs/GETTING-STARTED.md` returns at least one concrete remote/tunnel access reference.
- Manual truthfulness pass against referenced code/summaries confirms no overclaims beyond shipped web UI behavior.
</verification>

<success_criteria>
- README and Getting Started both describe the web UI as a real Pilot surface.
- Main shipped capabilities are documented at a high level: overview screens, merged step-aware timeline, branch/session drill-in, and action surfaces.
- Remote/tunneled access and narrow-screen/mobile follow-up are mentioned clearly.
- Copy remains concise and product-oriented, without speculative claims.
</success_criteria>

<output>
After completion, create `.planning/quick/085-quick-follow-up-update-readme-and-docs-f/085-SUMMARY.md`
</output>
