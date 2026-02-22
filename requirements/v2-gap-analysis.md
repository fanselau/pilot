# Pilot v2 Gap Analysis

> Generated: 2026-02-22 | Auditor: Gorb subagent

## Coverage Matrix

### v2 Core Requirements

| Requirement File | What It Asks For | Plan Coverage | Status |
|---|---|---|---|
| `pilot-v2-master.md` | Complete rewrite: nuke v1, SQLite queue, delegation AI, runner, CLI commands, dependency cleanup | 17-01 through 17-08 | ✅ COVERED |
| `pilot-v2-architecture.md` | Delegation AI, SQLite queue, CLI surface, systemd service, opencode DB monitoring | 17-01 (types/config), 17-02 (db), 17-03 (opencode-db), 17-04 (delegate), 17-05 (runner), 17-06 (CLI core), 17-07 (service/infra) | ✅ COVERED |
| `pilot-v2-tui.md` | OpenTUI-based TUI with dashboard, detail, split pane views | **NOT IN ANY PLAN** | ⚠️ DEFERRED (master.md says "Phase 2: TUI (Later)") |

### v1 Requirements (superseded by v2)

| Requirement File | What It Asks For | v2 Plan Coverage | Status |
|---|---|---|---|
| `pilot-cli.md` | Definitive CLI spec (v1) | Superseded by v2 architecture. v2 plans implement the new CLI surface. | ✅ SUPERSEDED |
| `pilot-gsd-fork.md` | Fork GSD, customize for pilot | **Not in v2 plans** — but pilot-gsd already exists and v2 doesn't change it | ✅ N/A (already done) |
| `queue-storage-migration.md` | QUEUE.md → JSON store | Superseded — v2 goes straight to SQLite (17-02) | ✅ SUPERSEDED |
| `smart-add.md` | Simple `pilot add` routing | Superseded by v2 add command with scope detection (17-06) | ✅ SUPERSEDED |
| `smart-verify-routing.md` | Smart verify for non-web projects | Delegation AI handles this (17-04) | ✅ SUPERSEDED |
| `smart-tail-stuck-detection.md` | Log-based stuck detection | Runner has stuck detection via opencode DB polling (17-05) | ✅ SUPERSEDED |
| `opencode-db-ground-truth.md` | Use opencode DB instead of PID/log files | Core v2 principle — 17-03, 17-05, 17-06 all read opencode DB | ✅ SUPERSEDED |
| `opencode-stuck-detection.md` | SQLite-based stuck detection | Covered by runner polling in 17-05 | ✅ SUPERSEDED |
| `daemon-mode-runner.md` | Persistent queue watcher daemon | Covered by runner (17-05) + systemd service (17-07) | ✅ SUPERSEDED |
| `production-hardening.md` | Multi-day unsupervised operation | **PARTIALLY COVERED** — see gaps below | ⚠️ PARTIAL |
| `gap-closure-resilience.md` | Resilient verify→fix cycles | Delegation AI replaces gap closure logic, but retry/resilience specifics unclear | ⚠️ PARTIAL |
| `integration-fixes.md` | v1 integration bugs | Superseded by v2 rewrite | ✅ SUPERSEDED |
| `overnight-fixes.md` | Claude→opencode rename, misc fixes | Superseded by v2 rewrite | ✅ SUPERSEDED |
| `claude-cleanup.md` | Remove claude binary references | Superseded by v2 rewrite | ✅ SUPERSEDED |
| `cli-polish.md` | Wire missing UX, fix refs | Superseded by v2 rewrite | ✅ SUPERSEDED |
| `finishing-touches.md` | Polish, DX, production readiness | **PARTIALLY COVERED** — see gaps below | ⚠️ PARTIAL |
| `e2e-test-suite.md` | End-to-end CLI tests | 17-08 has unit/command tests only. **No E2E tests in any plan.** | ❌ GAP |
| `read-requirements-opencode-db-ground-truth-md-and-implement-.md` | Implement opencode DB reads | Superseded by v2 (17-03) | ✅ SUPERSEDED |

---

## SPAWN-LESSONS.md Coverage

| # | Lesson | Referenced in Plans? | Status |
|---|---|---|---|
| 1 | Git GC on snapshot repos | **NOT explicitly in any plan** | ❌ GAP |
| 2 | setsid, NEVER nohup | 17-05 runner uses `detached: true` + `stdin: 'ignore'` — correct pattern | ✅ |
| 3 | Memory check before spawn | **NOT in any plan** | ❌ GAP |
| 4 | Spawn rate limiting (5s min) | **NOT in any plan** | ❌ GAP |
| 5 | Title truncation (80 chars) | 17-05 references `truncateTitle` from format.ts | ✅ |
| 6 | Binary resolution fallback | 17-04 delegate.ts has `resolveOpencodeBinary()` | ✅ |
| 7 | Config validation (opencode.json) | **NOT in any plan** | ❌ GAP |
| 8 | opencode.json instructions must be array | **NOT in any plan** | ❌ GAP |
| 9 | Disk space check | **NOT in any plan** — doctor checks memory but not disk | ❌ GAP |

**5 of 9 lessons are NOT implemented in any plan.** This is a critical gap — these are battle-tested fixes for real production failures.

---

## Detailed Gap Analysis

### ❌ GAPS — Required But Not In Any Plan

#### 1. Spawn Safety (SPAWN-LESSONS 1, 3, 4, 7, 8, 9)
The runner (17-05) spawns opencode sessions but doesn't implement:
- **Git GC disable** on snapshot repos before spawn (Lesson 1) — causes SIGKILL in prod
- **Memory check** before spawn (Lesson 3) — causes OOM on 16GB VPS
- **Rate limiting** between spawns (Lesson 4) — thundering herd
- **Config validation** of opencode.json (Lessons 7, 8) — silent failures
- **Disk space check** (Lesson 9) — snapshots fill disk

**Recommendation:** Add a "spawn guard" module (Plan 17-05 addendum or new plan) that runs all pre-spawn checks. The runner should call `ensureSpawnSafe()` before every `execa()` call.

#### 2. E2E Tests
`e2e-test-suite.md` asks for full CLI validation against real filesystem. 17-08 only has unit tests with mocked deps. No plan tests the actual `pilot add` → `pilot status` → `pilot run` flow.

**Recommendation:** Add a Plan 17-09 for E2E integration tests.

#### 3. Production Hardening Details
`production-hardening.md` asks for:
- Automatic stuck session killing (runner has detection but unclear on kill mechanism)
- OOM recovery / auto-restart (systemd `Restart=always` covers this partially)
- Log rotation / disk management
- Zombie process cleanup
- Health endpoint / monitoring

Plans cover the basics but not the specific hardening measures.

**Recommendation:** Many of these are handled by systemd (`Restart=always`) and the runner's stuck detection. Add explicit stuck-kill logic to runner. Add disk space monitoring to doctor or runner loop.

#### 4. TUI Implementation
`pilot-v2-tui.md` is a 400+ line detailed spec with layouts, navigation, components, animation. No plan covers any of it. The master requirement explicitly defers it to "Phase 2", so this is **intentional** — but it's worth noting that ~25% of the requirements effort has no execution plan.

**Not a gap per se** — but ensure the v2 core is TUI-ready (data layer, polling, state) so the TUI can be added cleanly later.

---

### ⚠️ RISKS — Underspecified or Fragile

#### 1. Delegation AI Reliability
The entire v2 architecture hinges on the delegation AI correctly reading `.planning/` and outputting valid JSON. If it halluccinates phase numbers, outputs malformed JSON, or misreads state:
- **Risk:** Delegation creates wrong phase numbers → overwrites existing work
- **Risk:** JSON parsing fails → job stuck in running state
- **Risk:** Delegation doesn't understand edge cases (partial phases, blocked work)
- **Mitigation in plans:** parseDelegationOutput has validation (17-04), 120s timeout
- **Missing:** No fallback if delegation consistently fails. No human-in-the-loop override.

**Recommendation:** Add `pilot add --plan '{"steps":[...]}' ` escape hatch to skip delegation. Add delegation retry (delegation session failed → retry once with different prompt/model).

#### 2. Session Completion Detection
Runner polls opencode DB for session completion: `!processAlive && lastMessage > 60s ago`. Risks:
- **Risk:** Session produces no messages (immediate crash) → 30s timeout catches this but marks as "done" not "failed"
- **Risk:** Session hangs with process alive but no messages → stuck detection threshold is 90min (configurable), but that's a long wait
- **Risk:** opencode DB doesn't update `isSessionActive` immediately on process exit

**Recommendation:** Cross-reference with OS process table as a backup (cheap `kill -0` check). Add explicit exit code tracking if opencode supports it.

#### 3. `updateSessionTitles` Append Logic
17-02 spec says "updateSessionTitles appends to existing titles (does not overwrite)" but the 17-05 runner calls `updateSessionTitles(job.id, [title])` with a single-element array. The append-vs-replace semantics need to be clear in db.ts implementation.

#### 4. Quick Scope File Content
Both `pilot-v2-master.md` and `pilot-v2-architecture.md` emphasize that quick scope with a file must pass FULL content (v1 bug fix). Plan 17-06 add.ts handles this. But the delegation AI (17-04) gsd-delegate.md also has a note about this: "the args field MUST contain the full task description text... NEVER output 'Read <path>'". Risk: the delegation AI might still output "Read requirements/foo.md" despite the instruction.

**Recommendation:** Add a post-delegation validation step: if any step.args contains "Read " + a file path, replace it with the actual file content.

#### 5. Service Command Assumes User Systemd
17-07 service.ts uses `systemctl --user`. This requires:
- User lingering enabled (`loginctl enable-linger`)
- A `~/.config/systemd/user/pilot-runner.service` file
- No plan creates this service file

**Recommendation:** Add service file creation to `pilot service start` (or `pilot setup`) if it doesn't exist. Or add it to Plan 17-07 explicitly.

---

## Master Checklist Audit (`pilot-v2-master.md`)

| Section | What's Required | Plan | Status |
|---|---|---|---|
| Delete v1 code | Remove listed files | 17-01 | ✅ |
| New SQLite queue schema | pilot.db with jobs table | 17-02 | ✅ |
| New db.ts wrapper | CRUD functions | 17-02 | ✅ |
| Extend opencode-db.ts | New query functions | 17-03 | ✅ |
| New delegate.ts | Delegation AI | 17-04 | ✅ |
| New runner.ts | Simple event loop | 17-05 | ✅ |
| New CLI entry point | Commander setup | 17-07 | ✅ |
| New add.ts | Smart scope detection | 17-06 | ✅ |
| New status.ts | Dashboard output | 17-06 | ✅ |
| Dependencies cleanup | Remove Ink/React, add date-fns | 17-01 | ✅ |
| Phase 2: TUI | Deferred | None | ⚠️ DEFERRED |
| Do NOT: keep v1 lifecycle code | Enforced by delete-first approach | 17-01 | ✅ |
| Do NOT: keep JSON queue | Replaced by SQLite | 17-02 | ✅ |
| Do NOT: parse .planning/ with regex | Delegation AI instead | 17-04 | ✅ |

---

## RECOMMENDATIONS

### Must-Do Before Shipping

1. **Add spawn safety to runner (17-05)** — Implement SPAWN-LESSONS 1, 3, 4, 7, 8, 9. Without these, the first multi-hour run will hit git GC CPU storms or OOM. These are not theoretical — they happened in v1 production.

2. **Create systemd service file** — Plan 17-07 has `service.ts` calling systemctl but no plan creates `~/.config/systemd/user/pilot-runner.service`. Add it.

3. **Add delegation AI fallback** — If delegation fails 3 times, allow manual plan specification or fall back to scope-based defaults (quick→gsd-quick, phase→add/plan/execute/verify with guessed phase number).

### Should-Do

4. **Add E2E test plan (17-09)** — Unit tests mock everything. Need at least basic integration: add a job → run once → verify completion.

5. **Validate delegation output args** — Post-parse check that quick scope args contain actual content (not "Read <path>").

6. **Add disk space check** — To runner pre-spawn or doctor command.

### Nice-to-Have

7. **Notification on job completion** — `finishing-touches.md` asked for this. Not in any plan. Could be a simple webhook/telegram message from runner on markCompleted/markFailed.

8. **`pilot stuck --kill`** — v1 had this. v2 runner detects stuck but the CLI has no explicit stuck command. The delegation AI + runner handle it internally, but a manual override is useful.

9. **Bun migration decision** — TUI doc recommends migrating to Bun for OpenTUI. If TUI is next, this needs planning. If TUI is months away, irrelevant.

---

## Summary

**Coverage: 85% of actionable requirements are covered by the 8 plans.**

Critical gaps:
- 🔴 5/9 spawn lessons not implemented (production safety)
- 🔴 No systemd service file creation
- 🟡 No E2E tests
- 🟡 Delegation AI has no fallback mechanism
- 🟢 TUI intentionally deferred

The v2 plans are architecturally sound and cover the core rewrite well. The main risk is **production resilience** — the spawn safety lessons from v1 aren't carried forward into the plans, and these caused real outages. Fix that before shipping.
