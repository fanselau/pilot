# Pilot v2 TUI Design Document

## Executive Summary

Replace the current Ink-based TUI with **OpenTUI** (`@opentui/core`) — a native Zig terminal rendering engine with TypeScript bindings, Yoga flexbox layout, and diff-based rendering. OpenTUI powers OpenCode in production today, making it the natural choice for Pilot which already spawns OpenCode sessions.

---

## 1. Framework Research & Recommendation

### Frameworks Evaluated

| Framework | Language | Verdict | Why |
|-----------|----------|---------|-----|
| **Ink** (current) | TS/React | ❌ Replace | Full re-renders cause flicker. React reconciler overhead. No scroll on completed items. Layout primitives too weak for split panes. |
| **blessed / neo-blessed** | JS | ❌ Skip | Abandoned (blessed: 2015, neo-blessed: 2020). 16k LOC monolith. Memory leaks on long-running processes. |
| **terminal-kit** | JS | ❌ Skip | Feature-rich but imperative API, no component model. Hard to maintain complex layouts. |
| **bubbletea** | Go | ❌ Wrong lang | Beautiful Elm Architecture, but Go. Can't share code with Pilot's TS codebase. |
| **Textual** | Python | ❌ Wrong lang | Best-in-class TUI framework. CSS-like styling. Reference for what "good" looks like, but Python. |
| **clack / @topcli/prompts** | TS | ❌ Wrong tool | Great for one-shot prompts, not persistent dashboards. |
| **Raw ANSI + custom renderer** | TS | ❌ Too much work | Maximum control but massive effort. Would need to build layout engine, scrolling, focus management from scratch. |
| **@preact/signals + Ink** | TS | ❌ Lipstick on pig | Signals might reduce re-renders but Ink's fundamental rendering model (clear + reprint) still flickers. |
| **@opentui/core** | TS/Zig | ✅ **WINNER** | Native Zig rendering core. Yoga flexbox. Diff-based rendering (zero flicker). 30fps render loop. Mouse + keyboard. Powers OpenCode. TypeScript API. Active development (SST/Anomaly). |

### Why OpenTUI Wins

1. **Zero flicker** — Native Zig renderer diffs terminal cells, only updates what changed. No clear-and-reprint.
2. **Yoga flexbox** — Real CSS flexbox layout (percentages, flexGrow, responsive). Split panes trivial.
3. **Performance** — Native code, not JS string concatenation. 30fps default, 60fps max.
4. **Component model** — `Box`, `Text`, `Input`, `Select` primitives compose naturally.
5. **Already in the ecosystem** — OpenCode uses it. Pilot spawns OpenCode. Same team, same patterns.
6. **SolidJS reconciler available** — `@opentui/solid` for reactive UI if we want fine-grained reactivity.
7. **Mouse support** — Built-in mouse tracking, click-to-focus.
8. **Alternate screen** — Proper fullscreen TUI, restores terminal on exit.

### Caveat

OpenTUI is currently **Bun-exclusive**. Pilot runs on Node. Options:
- **Option A**: Migrate Pilot to Bun (recommended — faster, better DX, aligns with OpenTUI ecosystem)
- **Option B**: Wait for Node support (in progress per OpenTUI docs)
- **Option C**: Use `@opentui/core` imperative API which may have fewer runtime constraints

**Recommendation**: Option A. Bun is production-ready and Pilot is a CLI tool, not a library. Migration is low-risk.

---

## 2. Layout Specification

### View 1: Dashboard (Default)

```
┌─ Pilot v2 ──────────────────────────────────────────── 3 queued │ 2 running │ 47 done ─┐
│                                                                                         │
│  ┌─ Queue ─────────────────────────────────────┐ ┌─ Running ──────────────────────────┐ │
│  │  ▸ #52  punchlab  quick  "Fix hero CTA"     │ │  ● #50  toolbird  phase             │ │
│  │    #53  toolbird  phase  "Add OAuth flow"   │ │    "Implement GitHub OAuth"          │ │
│  │    #54  punchlab  quick  "SEO meta tags"    │ │    ⏱ 4m32s  ◆ 12.4k tokens          │ │
│  │    #55  pilot     quick  "TUI v2"           │ │    ├ session: ses_a1b2c3              │ │
│  │                                             │ │    └ last: "Installing dependencies"  │ │
│  │                                             │ │                                      │ │
│  │                                             │ │  ● #51  punchlab  milestone           │ │
│  │                                             │ │    "Landing page redesign"            │ │
│  │                                             │ │    ⏱ 18m07s  ◆ 89.2k tokens          │ │
│  │                                             │ │    ├ session: ses_d4e5f6              │ │
│  │                                             │ │    └ last: "Running tests..."         │ │
│  └─────────────────────────────────────────────┘ └────────────────────────────────────┘ │
│                                                                                         │
│  ┌─ Recent Completions ────────────────────────────────────────────────────────────────┐ │
│  │  ✓ #49  punchlab  quick  "Fix mobile nav"       2m14s   4.2k tok   2 min ago       │ │
│  │  ✗ #48  toolbird  quick  "Add rate limiting"    8m31s  22.1k tok   15 min ago       │ │
│  │  ✓ #47  punchlab  quick  "Update footer"        1m02s   2.8k tok   32 min ago       │ │
│  │  ✓ #46  pilot     phase  "Queue persistence"   12m44s  45.6k tok   1 hr ago         │ │
│  │  ✓ #45  punchlab  quick  "Hero animation"       3m18s   8.1k tok   2 hr ago         │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                         │
│  j/k navigate │ enter detail │ tab panel │ a add │ r retry │ x cancel │ / filter │ ? help│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### View 2: Job Detail

```
┌─ Job #50 ── toolbird ── phase ── "Implement GitHub OAuth" ──────────── Running ⏱ 4m32s ─┐
│                                                                                          │
│  ┌─ Info ─────────────────────┐ ┌─ Session Log ────────────────────────────────────────┐ │
│  │  Status:  ● Running        │ │  [4:28] 🤖 Reading src/auth/github.ts...            │ │
│  │  Project: toolbird         │ │  [4:29] 🤖 I need to add the OAuth callback handler  │ │
│  │  Scope:   phase            │ │  [4:30] 🤖 Writing src/auth/callback.ts              │ │
│  │  Created: 20:14 UTC        │ │  [4:31] 🤖 Adding route to src/routes/index.ts      │ │
│  │  Duration: 4m32s           │ │  [4:32] 🤖 Installing passport-github2               │ │
│  │  Session: ses_a1b2c3       │ │  [4:32] 🤖 Running npm test...                      │ │
│  │                            │ │  █                                                    │ │
│  │  ── Tokens ──              │ │                                                      │ │
│  │  Input:   8,421            │ │                                                      │ │
│  │  Output:  3,982            │ │                                                      │ │
│  │  Total:   12,403           │ │                                                      │ │
│  │  ▁▂▃▅▇█▅▃▂▁ usage/min     │ │                                                      │ │
│  │                            │ │                                                      │ │
│  │  ── Files Modified ──      │ │                                                      │ │
│  │  + src/auth/callback.ts    │ │                                                      │ │
│  │  ~ src/routes/index.ts     │ │                                                      │ │
│  │  ~ package.json            │ │                                                      │ │
│  └────────────────────────────┘ └──────────────────────────────────────────────────────┘ │
│                                                                                          │
│  esc back │ f follow log │ g/G top/bottom │ / search │ r retry │ x cancel │ ? help       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### View 3: Split Pane (Dashboard + Live Log)

```
┌─ Pilot v2 ──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ Jobs ──────────────────────────┐ ┌─ Live Log: #50 ────────────────────────────────┐  │
│ │  ● #50  toolbird  "OAuth"  4m   │ │  [4:28] Reading src/auth/github.ts...          │  │
│ │  ● #51  punchlab  "Landing" 18m │ │  [4:29] Adding OAuth callback handler          │  │
│ │  ◌ #52  punchlab  "Fix CTA"     │ │  [4:30] Writing src/auth/callback.ts           │  │
│ │  ◌ #53  toolbird  "OAuth flow"  │ │  [4:31] Adding route to src/routes/index.ts    │  │
│ │  ─────────────────────────────  │ │  [4:32] Installing passport-github2            │  │
│ │  ✓ #49  "Fix mobile nav"  2m    │ │  [4:32] Running npm test...                   │  │
│ │  ✗ #48  "Rate limiting"   8m    │ │  █                                             │  │
│ │  ✓ #47  "Update footer"   1m    │ │                                                │  │
│ └──────────────────────────────────┘ └────────────────────────────────────────────────┘  │
│  j/k navigate │ enter expand │ tab switch pane │ s split │ q quit                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Navigation Map

### Global Keys

| Key | Action |
|-----|--------|
| `q` / `Ctrl+C` | Quit |
| `?` | Toggle help overlay |
| `/` | Open search/filter |
| `Esc` | Back / close overlay |
| `Tab` | Cycle focus between panels |
| `s` | Toggle split pane mode |
| `1` `2` `3` | Jump to Dashboard / Detail / Split view |

### Dashboard View

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | Open job detail |
| `a` | Add new job (opens input) |
| `r` | Retry failed job |
| `x` | Cancel job |
| `p` | Pause queue |
| `J` / `K` | Reorder job in queue (move up/down) |
| `g` | Jump to top |
| `G` | Jump to bottom |

### Job Detail View

| Key | Action |
|-----|--------|
| `Esc` | Back to dashboard |
| `f` | Toggle follow mode (auto-scroll log) |
| `j` / `k` | Scroll log |
| `g` / `G` | Top / bottom of log |
| `/` | Search in log |
| `n` / `N` | Next / prev search result |
| `r` | Retry this job |
| `x` | Cancel this job |

### View Transitions

```
Dashboard ──Enter──→ Job Detail
    │                    │
    │←──────Esc──────────┘
    │
    ├──s──→ Split Pane
    │           │
    │←───s──────┘
```

---

## 4. Data Flow

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    TUI Process                       │
│                                                      │
│  ┌──────────┐    ┌───────────┐    ┌──────────────┐  │
│  │ DataStore │───→│ ViewModel │───→│ OpenTUI      │  │
│  │ (polling) │    │ (derived) │    │ Components   │  │
│  └──────────┘    └───────────┘    └──────────────┘  │
│       │                                              │
│       ├── pilot.db (SQLite, read)                    │
│       └── opencode.db (SQLite, read)                 │
└─────────────────────────────────────────────────────┘
```

### Data Sources

| Source | Path | What | Refresh Rate |
|--------|------|------|-------------|
| `pilot.db` | `~/.pilot/pilot.db` | Queue, jobs, status, history | 1s (polling) |
| `opencode.db` | `~/.local/share/opencode/opencode.db` | Sessions, messages, tokens | 2s (polling), 500ms when tailing |

### Polling Strategy

- **Active job list**: Poll `pilot.db` every 1 second for queue/status changes
- **Running job log**: Poll `opencode.db` every 500ms for new messages when in detail/split view
- **Completed jobs**: Poll every 5 seconds (low priority, things don't change)
- **Token stats**: Compute on each poll from `opencode.db` message table
- **Use WAL mode**: Both DBs should use WAL for concurrent read access without locking

### ViewModel Layer

```typescript
interface PilotState {
  queue: Job[]          // pending jobs, ordered
  running: Job[]        // active jobs with live stats
  completed: Job[]      // recent completions (last 50)
  selected: number      // cursor position
  view: 'dashboard' | 'detail' | 'split'
  detailJobId?: number
  filter?: { project?: string; status?: string; query?: string }
}

interface Job {
  id: number
  project: string
  scope: 'quick' | 'phase' | 'milestone'
  description: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  sessionId?: string
  // From opencode.db join:
  tokenUsage?: { input: number; output: number }
  lastMessage?: string
  messages?: Message[]  // loaded on demand for detail view
}
```

---

## 5. Component Breakdown

### Component Tree

```
App
├── StatusBar              (top: title + aggregate stats)
├── Dashboard              (default view)
│   ├── QueuePanel         (left-top: pending jobs list)
│   ├── RunningPanel       (right-top: active jobs with progress)
│   └── CompletedPanel     (bottom: scrollable history)
├── JobDetail              (detail view)
│   ├── InfoPanel          (left: metadata, tokens, sparkline)
│   └── LogPanel           (right: scrollable session transcript)
├── SplitPane              (split view)
│   ├── JobList            (left: condensed all-jobs list)
│   └── LogPanel           (right: live log of selected job)
├── FilterOverlay          (modal: search/filter input)
├── HelpOverlay            (modal: keyboard shortcuts)
└── FooterBar              (bottom: context-sensitive key hints)
```

### Key Components

#### StatusBar
- Fixed height: 1 row
- Shows: app name, queue counts by status, clock
- Updates every 1s

#### QueuePanel
- Scrollable list of pending jobs
- Highlighted selection with `▸` indicator
- Columns: id, project, scope, description (truncated to fit)
- Dim foreground color for "waiting" feel

#### RunningPanel
- Each running job gets a card-like box
- Pulsing `●` indicator (alternate between bright blue / dim blue each second)
- Shows: elapsed time (updating), token count, session ID, last message
- Smooth counter animation for elapsed time

#### CompletedPanel
- Scrollable history, most recent first
- `✓` green for done, `✗` red for failed
- Shows: duration, token total, relative time ("2 min ago")
- New completions flash briefly (inverse colors for 2s)

#### LogPanel
- Virtual scrolling (only render visible lines)
- Follow mode: auto-scroll to bottom on new messages
- Syntax-aware: dim timestamps, highlight file paths, color code blocks
- Search highlighting with `/`

#### InfoPanel
- Static layout, updates on poll
- Sparkline widget for token usage over time (last 20 data points)
- File diff summary if available

---

## 6. Animation & Transition Spec

### Status Color Scheme

| Status | Color | Style |
|--------|-------|-------|
| Pending | `#666666` (dim gray) | Steady |
| Running | `#4A9EFF` (bright blue) | Pulse: alternate `#4A9EFF` ↔ `#2D6FBF` every 1s |
| Done | `#4ADE80` (green) | Flash inverse for 2s on completion, then steady |
| Failed | `#F87171` (red) | Bold, steady |
| Cancelled | `#A1A1AA` (zinc) | Strikethrough |

### Transitions

- **Job starts**: Moves from Queue → Running panel. Running panel box appears with a brief bright flash.
- **Job completes**: Moves from Running → Completed panel top. 2-second inverse highlight then fades to normal.
- **New completion badge**: Counter in StatusBar briefly pulses if user hasn't viewed it.
- **View switch**: Instant. No animation (terminals don't benefit from slide transitions).

### Counter Animations

- **Elapsed time**: Updates every second. No flicker because OpenTUI diffs cells.
- **Token count**: Updates on each poll. Number change is instant (no counting animation — would be distracting).

### Pulse Effect (Running Indicator)

```typescript
// Toggle color every second using renderer's continuous mode
let bright = true
setInterval(() => {
  runningDot.update({ fg: bright ? '#4A9EFF' : '#2D6FBF' })
  bright = !bright
}, 1000)
```

---

## 7. Implementation Plan

### Phase 0: Bun Migration (1-2 days)
- Migrate Pilot from Node to Bun
- Verify all existing functionality (SQLite, child processes, etc.)
- Update CI/CD

### Phase 1: Core Shell (2-3 days)
- Install `@opentui/core`
- Create renderer, alternate screen, keyboard handling
- Implement `App` shell with StatusBar + FooterBar
- View routing (dashboard/detail/split)
- Basic keyboard navigation (j/k/Enter/Esc/Tab/q)

### Phase 2: Dashboard View (3-4 days)
- QueuePanel with scrollable job list
- RunningPanel with live job cards
- CompletedPanel with history
- Data polling from `pilot.db`
- Color-coded statuses
- Panel focus cycling with Tab

### Phase 3: Data Integration (2-3 days)
- OpenCode DB reader for sessions/messages/tokens
- ViewModel layer bridging both DBs
- Polling timers with appropriate rates
- Token usage computation

### Phase 4: Job Detail View (2-3 days)
- InfoPanel with metadata + sparkline
- LogPanel with virtual scrolling
- Follow mode for live tailing
- Search in logs (`/`, `n`, `N`)
- Log message formatting (timestamps, file paths)

### Phase 5: Queue Management (1-2 days)
- Reorder jobs (`J`/`K`)
- Cancel job (`x`) with confirmation
- Retry failed job (`r`)
- Add job (`a`) — opens inline input
- Pause queue (`p`)

### Phase 6: Split Pane + Polish (2-3 days)
- Split pane view with resizable panels
- Filter overlay (`/` from dashboard)
- Help overlay (`?`)
- Notification badges for new completions
- Mouse click-to-select
- Responsive layout (adapt to terminal size)

### Phase 7: Nice-to-Haves (ongoing)
- Sparklines for token usage over time
- Theme support (config file)
- Export job log to file

### Total Estimate: ~14-20 days

---

## 8. Technical Notes

### Dependencies

```json
{
  "@opentui/core": "latest",
  "better-sqlite3": "^11.0.0",
  "date-fns": "^3.0.0"
}
```

That's it. OpenTUI handles rendering, layout, input, mouse. SQLite for data. Date-fns for relative times. Zero bloat.

### File Structure

```
src/tui/
├── index.ts              # Entry point, create renderer
├── app.ts                # Root component, view routing
├── state.ts              # PilotState, actions, reducers
├── data/
│   ├── pilot-db.ts       # Read from pilot.db
│   ├── opencode-db.ts    # Read from opencode.db
│   └── poller.ts         # Polling scheduler
├── views/
│   ├── dashboard.ts      # Dashboard layout
│   ├── detail.ts         # Job detail layout
│   └── split.ts          # Split pane layout
├── components/
│   ├── status-bar.ts     # Top bar
│   ├── footer-bar.ts     # Bottom key hints
│   ├── queue-panel.ts    # Pending jobs list
│   ├── running-panel.ts  # Active jobs cards
│   ├── completed-panel.ts# History list
│   ├── log-panel.ts      # Scrollable log viewer
│   ├── info-panel.ts     # Job metadata + sparkline
│   ├── filter-overlay.ts # Search/filter modal
│   └── help-overlay.ts   # Keyboard help modal
├── widgets/
│   ├── sparkline.ts      # ASCII sparkline chart
│   ├── scrollable.ts     # Virtual scroll container
│   └── pulse-dot.ts      # Animated status indicator
└── theme.ts              # Colors, borders, spacing constants
```

### Why Not SolidJS Reconciler?

`@opentui/solid` is available but the imperative `@opentui/core` API is simpler for this use case. We're not building a form-heavy UI — it's mostly read-only panels with list navigation. The imperative API gives us direct control over updates without reconciler overhead. If the UI grows more complex later, migrating to Solid is straightforward since the component primitives are the same.

---

## 9. Anti-Patterns to Avoid

- **DO NOT** clear and reprint the screen (this is why Ink flickers)
- **DO NOT** poll faster than needed (500ms for active logs, 5s for completed)
- **DO NOT** load full message history into memory (virtual scroll, load on demand)
- **DO NOT** block the render loop with synchronous DB reads (use async/worker)
- **DO NOT** use React/Ink patterns (useState, useEffect) — this is imperative
- **DO NOT** animate things that don't need animation (keep it professional, not flashy)
