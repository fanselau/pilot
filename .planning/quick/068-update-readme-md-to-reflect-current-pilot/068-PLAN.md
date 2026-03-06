---
phase: quick
plan: 068
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
must_haves:
  truths:
    - "README has a What's New callout mentioning skills, judge, and per-job timeouts"
    - "Skills System section documents all 6 subcommands (add/list/sync/tag/remove/categories) with category-based matching and auto-injection"
    - "AI Judge section documents succeeded/failed/doubting verdicts with confidence score and integration with notifications"
    - "Configuration section does NOT list stuckThreshold, defaultTimeout, or pollInterval — documents per-job --timeout flag instead"
    - "CLI Reference includes pilot skills commands table and --timeout/--categories flags on pilot add"
    - "Architecture diagram shows skills injection step in runner and judge step with verdict details"
    - "All brand assets (header SVG, badges, demo GIF) are intact and unchanged"
    - "Existing feature descriptions (delegation AI, model profiles, managed projects, TUI, daemon, notifications) remain accurate"
  artifacts:
    - path: "README.md"
      provides: "Updated project README reflecting current capabilities"
  key_links:
    - from: "README.md Skills section"
      to: "src/commands/skills.ts"
      via: "documented CLI commands match actual subcommands"
    - from: "README.md Configuration table"
      to: "src/core/types.ts"
      via: "env vars match PilotConfig fields (stuckThreshold/defaultTimeout/pollInterval removed)"
    - from: "README.md AI Judge section"
      to: "src/core/judge.ts"
      via: "verdict shape matches JudgeVerdict type"
---

<objective>
Verify and finalize the README.md updates that document current Pilot capabilities.

Purpose: The README has uncommitted changes adding Skills System, AI Judge, per-job timeouts, updated Configuration, updated CLI Reference, and updated Architecture diagram. These changes need to be verified against the actual codebase for accuracy, adjusted if any details are stale or wrong, and committed.

Output: A verified, accurate README.md reflecting Pilot's current state.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@src/core/types.ts
@src/core/skills.ts
@src/commands/skills.ts
@src/core/judge.ts
@src/core/runner.ts
@src/core/callback.ts

Style guidance:
- Follow OSS README conventions: concise, show-don't-tell, use tables and code blocks
- GFM formatting with GitHub admonition syntax where appropriate
- No emoji overuse — the existing README uses zero emoji, keep it that way
- Keep brand assets (header SVG, badges, demo GIF) intact
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify README accuracy against codebase and finalize</name>
  <files>README.md</files>
  <action>
The README has uncommitted changes that add Skills System, AI Judge, updated Configuration, updated CLI Reference, and updated Architecture sections. Verify each section against the actual source code:

1. **Skills System section** — Read `src/commands/skills.ts` and `src/core/skills.ts`. Confirm all 6 subcommands exist (add, list, remove, tag, categories, sync). Confirm category-based matching and auto-injection/cleanup behavior is accurately described. Confirm `--categories` flag on `pilot add` exists in `src/commands/add.ts`.

2. **AI Judge section** — Read `src/core/judge.ts` and the runner's judge integration. Confirm the verdict shape (succeeded/failed/doubting with confidence and reason) matches the `JudgeVerdict` type. Confirm the confidence threshold table (doubting ≥50 = pass, <50 = fail) matches `evaluateVerdict()` logic. Confirm verdict is included in notifications by checking `src/core/callback.ts`.

3. **Configuration section** — Read `src/core/types.ts` PilotConfig interface. Confirm `stuckThreshold`, `defaultTimeout`, and `pollInterval` are NOT in PilotConfig (they were removed in Phase 39). Confirm the env var table in README matches actual PilotConfig fields. Confirm `--timeout` flag exists on `pilot add`.

4. **CLI Reference** — Verify the skills commands table matches actual subcommand registrations in `src/commands/skills.ts`. Verify `--timeout <minutes>` and `--categories <cats>` appear in the `pilot add` row.

5. **Architecture diagram** — Confirm "Inject skills" appears in the Runner box. Confirm the Judge box shows "succeeded / failed / doubting + confidence". Confirm "Include verdict" in the Complete/Fail box. Confirm pipeline flow summary line exists.

6. **What's New callout** — Confirm the blockquote near the top mentions skills, judge, and per-job timeouts.

7. **Existing sections** — Spot-check that delegation AI, model profiles, managed projects, TUI, daemon mode, notifications, and health checks sections remain accurate. Verify no references to removed config fields leaked into other sections.

If any inaccuracy is found, fix it. If `pilot skills remove` is actually `pilot skills remove <name>` (not `pilot skills uninstall`), ensure README matches. If the `--skill` flag on `pilot skills add` doesn't exist, remove it from the table.

After verification, ensure no trailing whitespace issues or broken markdown formatting.
  </action>
  <verify>
Run `git diff -- README.md` to see the final state of changes. Visually confirm:
- Skills section has all 6 commands with correct syntax
- Judge section has verdict table with correct thresholds  
- Config table has NO stuckThreshold/defaultTimeout/pollInterval rows
- Config table HAS all current PILOT_* env vars
- Architecture diagram includes skills injection and judge verdict details
- Brand assets (lines 1-18) are unchanged from committed version
  </verify>
  <done>
README.md accurately reflects current Pilot capabilities. All added sections (Skills System, AI Judge, updated Config, updated CLI Reference, updated Architecture) verified against source code. No stale references to removed config fields. Brand assets intact.
  </done>
</task>

</tasks>

<verification>
- `grep -c "stuckThreshold\|defaultTimeout\|pollInterval" README.md` returns 0 (removed config fields not mentioned anywhere)
- `grep -c "skills add\|skills list\|skills remove\|skills tag\|skills categories\|skills sync" README.md` returns at least 6 (all subcommands documented)
- `grep -c "succeeded\|doubting\|failed" README.md` returns at least 3 (all verdict types documented)
- `grep -c "--timeout\|--categories" README.md` returns at least 2 (new flags documented)
- `grep -c "Inject skills" README.md` returns 1 (architecture diagram updated)
- `grep -c "What's New" README.md` returns 1 (callout present)
- Brand header SVG reference intact: `grep "final-readme-header.svg" README.md` returns match
</verification>

<success_criteria>
README.md is verified accurate against the codebase and ready to commit. Every new section (Skills, Judge, updated Config, updated CLI, updated Architecture) matches the actual implementation. No removed config fields referenced. Brand assets untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/068-update-readme-md-to-reflect-current-pilot/068-SUMMARY.md`
</output>
