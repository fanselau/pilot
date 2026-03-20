---
phase: quick-089
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - pilot-gsd/commands/gsd-judge.md
  - pilot-gsd/commands/pilot-judge.md
  - test/core/runner-verification-evidence.test.ts
  - .planning/phases/68-judge-system-move-into-pilot/68-judge-system-move-into-pilot-VERIFICATION.md
autonomous: true

must_haves:
  truths:
    - "pilot-gsd judge commands have deprecation notices pointing to Pilot's inline judge"
    - "isWellFormedVerificationEvidence has test coverage for valid/invalid cases"
    - "Phase 68 VERIFICATION.md accurately reflects current code state"
  artifacts:
    - path: "pilot-gsd/commands/gsd-judge.md"
      provides: "Deprecated judge command with notice"
      contains: "DEPRECATED"
    - path: "pilot-gsd/commands/pilot-judge.md"
      provides: "Deprecated judge command with notice"
      contains: "DEPRECATED"
    - path: "test/core/runner-verification-evidence.test.ts"
      provides: "Test coverage for isWellFormedVerificationEvidence"
  key_links: []
---

<objective>
Close Phase 68 (Judge System — Move Into Pilot) verification gaps.

Purpose: Phase 68 VERIFICATION.md flagged 3 gap categories. Investigation reveals:
1. **Test failures** — Already fixed by quick-086 (1166/1166 tests pass).
2. **RNIN-05/RNIN-06 structural validation** — Already implemented! `isWellFormedVerificationEvidence()` at runner.ts:200-213 checks frontmatter (status/verdict fields) AND body headings (`## ` markers). The VERIFICATION.md report was based on a stale snapshot. But no test coverage exists for this function.
3. **CLEN-01/CLEN-02 pilot-gsd legacy commands** — `gsd-judge.md` and `pilot-judge.md` still contain full active command definitions. Need deprecation notices.

Output: Deprecation notices in pilot-gsd commands, test coverage for evidence validation, updated VERIFICATION.md.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/68-judge-system-move-into-pilot/68-judge-system-move-into-pilot-VERIFICATION.md
@.planning/quick/086-fix-phase-65-verification-gaps-3-test-su/086-SUMMARY.md
@src/core/runner.ts (lines 153-213 — readVerificationEvidence + isWellFormedVerificationEvidence)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Deprecate pilot-gsd judge commands + add evidence validation tests</name>
  <files>
    pilot-gsd/commands/gsd-judge.md
    pilot-gsd/commands/pilot-judge.md
    test/core/runner-verification-evidence.test.ts
  </files>
  <action>
**pilot-gsd deprecation notices:**

Add a prominent deprecation notice block at the TOP of both files (after frontmatter), before existing content:

For `gsd-judge.md`:
```
> **⚠️ DEPRECATED** — This command is superseded by Pilot's inline judge system (src/prompts/judge.md).
> The runner now executes judge evaluation inline with pass/fail/partial verdicts, retry metadata,
> and failure fingerprinting. This file is kept for reference only. Do not use.
```

For `pilot-judge.md`:
```
> **⚠️ DEPRECATED** — This command is superseded by Pilot's inline judge system (src/prompts/judge.md).
> The runner now executes judge evaluation inline with pass/fail/partial verdicts, retry metadata,
> and failure fingerprinting. This file is kept for reference only. Do not use.
```

**Test coverage for isWellFormedVerificationEvidence:**

Create `test/core/runner-verification-evidence.test.ts` with tests for the `isWellFormedVerificationEvidence` function. Since it's not exported, test it indirectly through `readVerificationEvidence` (which IS accessible via the runner's internal behavior), OR export the function with a `@internal` JSDoc tag for direct testing.

Approach: Export `isWellFormedVerificationEvidence` as `_isWellFormedVerificationEvidence` (internal test export pattern used elsewhere in codebase). Add tests:

1. **Rejects content <= 100 bytes** — short content returns false
2. **Rejects content without frontmatter** — no `---` delimiters returns false
3. **Rejects frontmatter missing status field** — has verdict but no status returns false
4. **Rejects frontmatter missing verdict field** — has status but no verdict returns false
5. **Rejects content without body headings** — valid frontmatter but no `## ` in body returns false
6. **Accepts well-formed VERIFICATION.md** — valid frontmatter with status + verdict + body headings returns true
7. **Accepts content with extra frontmatter fields** — additional fields don't break validation

This confirms RNIN-05/RNIN-06 are actually satisfied by existing code.
  </action>
  <verify>
    `npx vitest run test/core/runner-verification-evidence.test.ts` passes with all 7 tests green.
    Deprecation notices visible in both pilot-gsd command files.
  </verify>
  <done>
    pilot-gsd judge commands have clear deprecation notices.
    isWellFormedVerificationEvidence has test coverage proving structural validation works (not just length check).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Phase 68 VERIFICATION.md to reflect resolved gaps</name>
  <files>
    .planning/phases/68-judge-system-move-into-pilot/68-judge-system-move-into-pilot-VERIFICATION.md
  </files>
  <action>
Update the VERIFICATION.md frontmatter and body to reflect that ALL gaps are now resolved:

**Frontmatter changes:**
- `status: gaps_found` → `status: verified`
- `score: 6/9` → `score: 9/9`
- `tests: { pass: false, ... }` → `tests: { pass: true, summary: "1166 passed, 0 failed", ... }`
- `verdict: FAIL` → `verdict: PASS`
- Remove or clear `blocking_issues` array
- Remove or clear `gaps` array

**Body changes:**
- Observable Truth #5 (VERIFICATION.md validation): Change status to ✓ VERIFIED. Evidence: `isWellFormedVerificationEvidence()` at runner.ts:200-213 validates frontmatter (status/verdict) and body headings. Tests in `test/core/runner-verification-evidence.test.ts` confirm.
- Observable Truth #8 (Legacy judge deprecation): Change status to ✓ VERIFIED. Evidence: Deprecation notices added to both pilot-gsd command files.
- Observable Truth #9 (Automated checks green): Change status to ✓ VERIFIED. Evidence: 1166 tests pass (0 failures). Test fixes applied in quick-086.
- Update the `src/core/runner.ts` artifact from ⚠️ PARTIAL to ✓ VERIFIED
- Update the `pilot-gsd/commands/gsd-judge.md` artifact status to ✓ VERIFIED (deprecated)
- Update the `pilot-gsd/commands/pilot-judge.md` artifact status to ✓ VERIFIED (deprecated)
- Update RNIN-05/RNIN-06 requirements from ✗ BLOCKED to ✓ SATISFIED
- Update CLEN-01/CLEN-02 requirements from ✗ BLOCKED to ✓ SATISFIED
- Remove Anti-Patterns Found section content (no longer applicable)
- Update Gaps Summary to state all gaps are resolved
- Update the `readVerificationEvidence()` key link from ⚠️ PARTIAL to ✓ WIRED
- Remove the Human Verification Required section content (no longer needed since structural validation is tested)
- Update re-verification note to indicate this is a re-verification
  </action>
  <verify>Read the updated VERIFICATION.md and confirm all truths show ✓ VERIFIED and verdict is PASS.</verify>
  <done>Phase 68 VERIFICATION.md accurately reflects all gaps closed — 9/9 truths verified, verdict PASS.</done>
</task>

</tasks>

<verification>
- `npx vitest run` full suite passes (1166+ tests, 0 failures)
- `npx vitest run test/core/runner-verification-evidence.test.ts` — new tests pass
- `grep -l DEPRECATED pilot-gsd/commands/gsd-judge.md pilot-gsd/commands/pilot-judge.md` — both files found
- Phase 68 VERIFICATION.md shows `verdict: PASS` and `score: 9/9`
</verification>

<success_criteria>
- All 3 Phase 68 verification gaps resolved
- pilot-gsd judge commands deprecated (not removed — submodule reference preserved)
- isWellFormedVerificationEvidence has test coverage proving RNIN-05/RNIN-06 compliance
- VERIFICATION.md updated to PASS with accurate evidence
- Full test suite green
</success_criteria>

<output>
After completion, create `.planning/quick/089-fix-phase-68-judge-move-verification-gap/089-SUMMARY.md`
</output>
