# Phase 51: Pilot notifications via `openclaw agent --deliver` - Research

**Researched:** 2026-03-10
**Domain:** Pilot job-completion notifications + OpenClaw delivery routing
**Confidence:** HIGH

## Summary

This phase replaces Pilot's current hook-based OpenClaw wake flow with CLI-based delivery using `openclaw agent --deliver` and explicit reply routing. The current implementation in `src/core/callback.ts` still posts `/hooks/wake` (derived from `PILOT_OPENCLAW_HOOKS_URL`), which OpenClaw documents as waking the **main** session only. That is structurally mismatched with group/DM agent-chat targeting.

The standard implementation path is: resolve a canonical notify route object (agent + reply channel + reply target + optional reply account), validate it strictly, then invoke `openclaw agent` through `execa` with argument arrays (no shell string concatenation), `--deliver`, and explicit reply overrides. Group vs DM is not a branch in code; it is entirely expressed by the resolved `to` value.

Pilot already has strong primitives to build on: queue-time notify intent (`--notify`, project owner fallback), fire-and-forget runner hooks, SQLite schema migrations, and test patterns around callback behavior. The planning focus should be route model/design and compatibility bridges for legacy owner/notify values.

**Primary recommendation:** Implement a typed OpenClaw delivery route resolver and make `notifyJobCompletion()` execute `openclaw agent --deliver` via `execa`, with strict route validation and zero `/hooks/wake` fallback for configured deliver targets.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| OpenClaw CLI (`openclaw agent`) | `2026.3.7` (installed) | Actual message delivery as agent-authored reply | Officially supports `--deliver` + `--reply-channel` + `--reply-to` + `--reply-account`; avoids unreliable hook semantics |
| `execa` | `^9.5.0` | Safe subprocess invocation from Node | Existing Pilot pattern; supports timeout and `reject: false` for non-throwing failure handling |
| `better-sqlite3` | `^12.6.2` | Persist project/job notify routing metadata | Existing queue/project source of truth; already has migration pattern in `migrateSchema()` |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `commander` | `^13.0.0` | CLI surface for route configuration | Add flags/subcommands for structured OpenClaw notify routes |
| `vitest` | `^2.1.0` | Unit/integration regression tests | Route parsing, callback execution args, group/DM route behavior |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| `openclaw agent --deliver` | `/hooks/wake` | Wakes main session only; not explicit chat-lane routing |
| `openclaw agent --deliver` | `/hooks/agent` with `deliver` | Runs isolated hook turn and posts summary into main session; observed as less reliable for natural target-chat flow |
| `execa` arg arrays | `child_process.exec` shell strings | Higher injection/quoting risk and weaker structured failure handling |

**Installation:**
```bash
npm install execa commander better-sqlite3
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   ├── callback.ts              # runner entrypoint, fire-and-forget wrapper
│   ├── notify-route.ts          # canonical route model + parse/derive/validate
│   ├── openclaw-deliver.ts      # execa wrapper for `openclaw agent --deliver`
│   └── db.ts                    # projects/jobs route persistence + migrations
├── commands/
│   ├── add.ts                   # queue-time route resolution/validation
│   └── project.ts               # set/show structured notify route
└── test/
    ├── core/callback.test.ts
    ├── core/notify-route.test.ts
    └── commands/project.test.ts
```

### Pattern 1: Route-First Resolution (Structured -> Legacy)

**What:** Resolve a canonical route object before delivery; never infer delivery flags ad hoc in callback execution.
**When to use:** Every completion/failure notification path.
**Example:**
```typescript
// Source: internal pattern from src/core/db.ts and requirements + docs
type OpenClawDeliverRoute = {
  kind: 'openclaw-agent-deliver';
  agentId: string;
  channel: string;
  to: string;
  accountId?: string;
};

function resolveNotifyRoute(job: Job, project: Project | null): OpenClawDeliverRoute {
  // 1) structured route on job (preferred)
  // 2) structured route on project
  // 3) safe legacy derive from callbackSessionKey/owner
  // 4) throw explicit config error (no wake fallback)
}
```

### Pattern 2: CLI Delivery Executor (No Hooks for Deliver Targets)

**What:** Invoke `openclaw agent` with explicit reply routing through `execa`.
**When to use:** Any route with `kind: openclaw-agent-deliver`.
**Example:**
```typescript
// Source: /openclaw/openclaw/v2026.3.7 docs + /sindresorhus/execa docs
const args = [
  'agent',
  '--agent', route.agentId,
  '--message', message,
  '--deliver',
  '--reply-channel', route.channel,
  '--reply-to', route.to,
  ...(route.accountId ? ['--reply-account', route.accountId] : []),
];

const result = await execa('openclaw', args, {
  timeout: 30_000,
  reject: false,
});

if (result.failed) {
  throw new Error(`openclaw deliver failed: ${result.stderr || result.stdout}`);
}
```

### Pattern 3: Structured Prompt Contract

**What:** Build one deterministic notification prompt containing all required job context.
**When to use:** Before calling `openclaw agent`.
**Example:**
```typescript
// Source: phase requirement contract
const prompt = [
  'You are sending a Pilot run update to your chat.',
  `job_id: ${job.id}`,
  `project: ${job.project}`,
  `description: ${truncate(job.description, 180)}`,
  `status: ${job.status}`,
  `verdict: ${verdict?.verdict ?? 'unknown'}`,
  `confidence: ${verdict?.confidence ?? 'n/a'}`,
  `next_step: ${nextStepHint(job)}`,
  'Reply naturally to the chat in your own voice.',
].join('\n');
```

### Anti-Patterns to Avoid

- **Implicit wake fallback:** If a deliver route is configured but invalid, do not silently post `/hooks/wake`.
- **Stringly route guessing:** Do not treat any arbitrary owner/session string as routable without strict parse/validation.
- **Shell command concatenation:** Do not build `openclaw agent` as one interpolated shell command.
- **Channel-special-case branching:** Do not fork logic by "group" vs "DM"; rely on route `to`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Agent-chat delivery transport | Custom webhook relay semantics | `openclaw agent --deliver` | OpenClaw already handles runtime, routing, and authored response behavior |
| Subprocess execution safety | `exec("openclaw ...")` strings | `execa(binary, args, opts)` | Correct escaping, timeout, non-throwing failure mode, structured stdout/stderr |
| Routing target inference | Loose regex from freeform owner strings | Typed resolver with strict schema + known legacy formats | Prevents wrong-chat sends and silent fallback bugs |
| SQLite migration orchestration | One-off manual migration scripts | Existing `migrateSchema()` additive column pattern | Proven in this repo; idempotent and testable |

**Key insight:** In this domain, delivery correctness is mostly a routing-data problem, not a message-sending problem. Use OpenClaw for sending, and spend engineering effort on route resolution + validation.

## Common Pitfalls

### Pitfall 1: Main-Session Wake Instead of Target Chat Delivery

**What goes wrong:** Notification appears as a wake/system event instead of a natural message in the intended group/DM chat.
**Why it happens:** `/hooks/wake` is documented to enqueue to main session only.
**How to avoid:** For `openclaw-agent-deliver` routes, bypass hooks entirely and run `openclaw agent --deliver`.
**Warning signs:** Logs show `/hooks/wake` POSTs; target chat stays silent.

### Pitfall 2: Silent Misrouting from Legacy Values

**What goes wrong:** Old `owner`/`callbackSessionKey` values (plain IDs or old session-key forms) route ambiguously or fail late.
**Why it happens:** Legacy values may not include `channel/to/accountId` required for explicit reply routing.
**How to avoid:** Implement a strict derivation matrix and produce explicit configuration errors when required fields are missing.
**Warning signs:** Notifications succeed in logs but appear in wrong lane or not at all.

### Pitfall 3: OpenClaw Gateway/Delivery Runtime Drift

**What goes wrong:** `openclaw agent` reports gateway failure and local fallback, changing runtime behavior.
**Why it happens:** OpenClaw can fall back to embedded local runs when gateway is unreachable.
**How to avoid:** Capture stderr/stdout from `execa`, log explicit failure reason, and add a route-delivery validation command/check.
**Warning signs:** stderr contains `Gateway agent failed; falling back to embedded`.

### Pitfall 4: Weak Error Surface in Fire-and-Forget Path

**What goes wrong:** Delivery fails but runner path looks successful with no actionable operator signal.
**Why it happens:** `notifyJobCompletion()` is intentionally non-blocking and caller ignores return value.
**How to avoid:** Keep non-throwing behavior, but standardize explicit config/runtime error lines and test them.
**Warning signs:** Completion marked done, but no notification and no clear error message.

## Code Examples

Verified patterns from official sources:

### OpenClaw Deliver CLI Pattern

```bash
# Source: https://docs.openclaw.ai/tools/agent-send
openclaw agent \
  --agent benefitu \
  --message "Pilot update ..." \
  --deliver \
  --reply-channel telegram \
  --reply-to "telegram:-5181925291" \
  --reply-account benefitu
```

### Execa Non-Throwing Failure Handling

```typescript
// Source: https://github.com/sindresorhus/execa/blob/main/docs/errors.md
const result = await execa('openclaw', args, { timeout: 30_000, reject: false });
if (result.failed) {
  process.stderr.write(`[notify] deliver failed: ${result.stderr}\n`);
}
```

### Legacy Session-Key Shape Guard (for safe derive only)

```typescript
// Source: https://docs.openclaw.ai/channels/channel-routing
// Known forms include:
// agent:<agentId>:<mainKey>
// agent:<agentId>:<channel>:group:<id>
// agent:<agentId>:<channel>:channel:<id>
// ...optionally with :topic:<threadId> / :thread:<threadId>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Pilot webhook `/hooks/agent` with `deliver=false` and synthetic hook session | Pilot webhook `/hooks/agent` with `deliver=true` | 2026-03-05 (`a6011c1`) | Improved direct delivery attempts but still hook-path dependent |
| Hook-agent delivery | `/hooks/wake` main-session event | 2026-03-05 (`ab53faf`) | Simpler wake behavior; loses explicit target-chat routing |
| Hook-based notification for OpenClaw target chats | `openclaw agent --deliver` with explicit reply routing | Phase 51 target | Restores reliable natural replies in agent's group/DM chat lane |

**Deprecated/outdated:**

- `/hooks/wake` for agent-chat notification routing: wakes main session only, not explicit lane targeting.
- Loose legacy notify values without route validation: insufficient for explicit deliver routing.

## Open Questions

1. **Canonical `to` format for `--reply-to` in Pilot config**
   - What we know: OpenClaw docs describe Telegram targets as chat ID or `@username`; phase requirement examples use `telegram:<id>`.
   - What's unclear: Whether both forms are universally accepted for `openclaw agent --reply-to` across installs.
   - Recommendation: Standardize one canonical stored format, then add a compatibility normalizer + integration test.

2. **Where to persist structured notify route(s)**
   - What we know: Current schema stores only `owner` and job `callback_session_key`/`callback_url` strings.
   - What's unclear: Whether to store structured route only at project-level, job-level snapshot, or both.
   - Recommendation: Store on project and snapshot to job at queue time for deterministic replay.

3. **Strict failure point for invalid configured routes**
   - What we know: Requirement demands precise configuration errors and no silent wake fallback.
   - What's unclear: Whether failure must block `pilot add`, block runner notify attempt only, or both.
   - Recommendation: Validate at `pilot add`/project-config time and revalidate at runtime with explicit error logs.

## Sources

### Primary (HIGH confidence)

- `/openclaw/openclaw/v2026.3.7` (Context7) - `openclaw agent` behavior, hooks semantics, channel/session routing
- `/sindresorhus/execa` (Context7) - timeout and `reject: false` subprocess handling
- `https://docs.openclaw.ai/tools/agent-send` - direct-agent delivery behavior and flags
- `https://docs.openclaw.ai/automation/webhook` - `/hooks/wake` and `/hooks/agent` semantics
- `https://docs.openclaw.ai/channels/channel-routing` - session key rules for DM/group/topic
- `src/core/callback.ts` - current Pilot notify implementation (`/hooks/wake`)
- `src/core/runner.ts` - fire-and-forget notify call sites and owner fallback
- `src/commands/add.ts` - queue-time notify resolution flow
- `src/core/db.ts` - jobs/projects schema and migration patterns
- `package.json` - in-repo dependency versions (`execa`, `better-sqlite3`, `commander`)
- `openclaw agent --help` and `openclaw --version` (local CLI) - installed version + flag surface

### Secondary (MEDIUM confidence)

- `git log -- src/core/callback.ts` and commit snapshots (`75cb979`, `a6011c1`, `ab53faf`) - evolution of notification strategy

### Tertiary (LOW confidence)

- `pilot-openclaw-agent-deliver-notifications.md` observed route examples (`to: "telegram:..."`) until canonical format is re-validated against current CLI behavior in integration tests

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - based on installed versions, package lock-in, and official OpenClaw/Execa docs
- Architecture: HIGH - directly grounded in current Pilot code paths + OpenClaw delivery semantics
- Pitfalls: HIGH - derived from official hook behavior, current callback implementation, and observed CLI fallback output

**Research date:** 2026-03-10
**Valid until:** 2026-03-17 (fast-moving OpenClaw CLI/docs; re-check after upgrades)
