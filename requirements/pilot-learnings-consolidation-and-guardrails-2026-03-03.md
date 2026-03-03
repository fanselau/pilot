# Pilot Learnings Consolidation + Reliability Guardrails (2026-03-03)

## Problem
Operational incidents exposed recurring reliability gaps:

- Ghost-running jobs remained `running` after underlying session ended.
- Same-project phase jobs were launched concurrently in scenarios that should serialize.
- Runner reload/restart interrupted in-flight execution (`Runner shutting down`, killed mid-delegation).
- Monitoring signal quality is noisy (repeated reminder spam, weak stale detection clarity).

These learnings exist across logs/chats but are not codified into a single operational + technical source of truth.

## Goal
Consolidate hard-earned learnings into an enforceable reliability layer:

1. Capture incident patterns + root causes in-repo.
2. Convert them into explicit guardrails in runner behavior.
3. Add startup/continuous reconciliation to prevent stale states from persisting.
4. Improve observability so operators can trust status at a glance.

## Requirements

### Must Have
- [ ] Add a dedicated reliability learnings document in repo (date-stamped) covering:
  - incident timeline,
  - observed failure modes,
  - confirmed root causes,
  - mitigations implemented,
  - remaining known risks.

- [ ] Add enforceable runner guardrails tied to these incidents:
  - hard same-project serialization at launch claim level,
  - stale-running reconciliation on startup and periodic cycle,
  - deterministic terminalization when underlying session/process is gone.

- [ ] Add graceful-reload contract documentation and implementation notes:
  - drain mode behavior,
  - no new launches while draining,
  - explicit restart handoff/recovery expectations.

- [ ] Add a `status integrity` check path:
  - if DB says `running` but no active backing session/process, surface as suspect/stale in status output.

- [ ] Add tests for the above with reproducible fixtures:
  - orphaned running job,
  - duplicate same-project launch attempt,
  - reload during active step.

### Nice to Have
- [ ] Optional operator command to run reconciliation only (`pilot reconcile` or equivalent).
- [ ] Structured incident event entries in runner log for postmortem tooling.

## Acceptance Criteria
- A single in-repo learnings doc exists and is referenced from relevant docs.
- Reproducing prior ghost-running condition results in automatic stale terminalization.
- Reproducing same-project concurrent launch scenario no longer launches both jobs.
- Status output warns clearly on integrity mismatch and does not silently show misleading `running` state.

## Do NOT
- Do NOT rely only on manual DB surgery as the standard fix path.
- Do NOT leave incident handling in chat context only.
- Do NOT introduce guardrails without automated tests.