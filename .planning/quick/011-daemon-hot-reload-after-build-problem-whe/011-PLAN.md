---
phase: quick-011
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - src/commands/reload.ts
  - src/index.ts
  - package.json
autonomous: true

must_haves:
  truths:
    - "After `npm run build`, the running daemon automatically restarts with new code"
    - "Running opencode processes survive the daemon reload — only the runner restarts"
    - "If no daemon is running, the postbuild signal is a silent no-op"
    - "Daemon writes PID to ~/.pilot/daemon.pid on startup"
    - "`pilot reload` manually triggers the same reload"
  artifacts:
    - path: "src/core/runner.ts"
      provides: "SIGHUP handler, PID file write/cleanup, graceful re-exec"
    - path: "src/commands/reload.ts"
      provides: "pilot reload command"
    - path: "package.json"
      provides: "postbuild script extended to signal daemon"
  key_links:
    - from: "package.json postbuild"
      to: "~/.pilot/daemon.pid"
      via: "read PID file, send SIGHUP if process exists"
    - from: "src/core/runner.ts SIGHUP handler"
      to: "process re-exec"
      via: "wait for current step to finish, then process.execv or spawn+exit"
    - from: "src/core/runner.ts"
      to: "~/.pilot/daemon.pid"
      via: "writeFileSync on startup, unlinkSync on shutdown"
---

<objective>
Add daemon hot-reload so `npm run build` automatically restarts the running daemon with new code, without killing running opencode processes.

Purpose: Currently after a build, the daemon keeps running old code. Bug fixes, log improvements, etc. don't take effect until manual restart. This is the #1 DX friction point when developing pilot itself.

Output: SIGHUP-based reload in runner, PID file management, postbuild signal script, `pilot reload` command.
</objective>

<execution_context>
@/home/luca/.config/opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/core/runner.ts
@src/core/config.ts
@src/core/types.ts
@src/index.ts
@package.json
@src/commands/service.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add PID file management and SIGHUP handler to Runner</name>
  <files>src/core/runner.ts</files>
  <action>
  Modify the Runner class in `src/core/runner.ts` to:

  1. **Write PID file on startup:** At the beginning of `run()`, write `process.pid` to `~/.pilot/daemon.pid` (get path from `getConfig().pilotDir`). Use `writeFileSync` for atomicity. Create `~/.pilot/` if it doesn't exist (`mkdirSync recursive`).

  2. **Clean up PID file on exit:** In a `finally` block wrapping the main `run()` loop (and in the shutdown handler), remove the PID file with `unlinkSync`. Wrap in try/catch to swallow ENOENT.

  3. **Handle SIGHUP for graceful reload:** In `setupShutdownHandlers()`, add a `SIGHUP` handler that:
     - Sets a `this.reloading = true` flag (new boolean field, default false)
     - Sets `this.running = false` to stop accepting new jobs from the queue
     - Logs to stderr: `[runner] SIGHUP received — reloading after current step completes...`
     - Does NOT kill activeJobs — running opencode processes survive

  4. **Re-exec after active jobs drain:** After the main while loop exits AND the "wait for active jobs to finish" block completes, check `this.reloading`. If true:
     - Log: `[runner] Reloading with new code...`
     - Remove the PID file (new process will write its own)
     - Re-exec: `process.execve` is not available in Node, so use `execa` to spawn `process.execPath` with `process.argv.slice(1)` (same args), detached, unref'd, with stdio inherited to /dev/null. Then `process.exit(0)`.
     - Actually simpler: since the daemon is managed by systemd (see service.ts), and systemd has `Restart=always`, the cleanest approach is: on SIGHUP, set reloading flag, wait for current jobs to drain, then `process.exit(0)`. Systemd will restart with new code automatically. If NOT running under systemd, spawn a new process before exiting.
     - Detect systemd: check if `process.env.INVOCATION_ID` is set (systemd sets this for services).
     - Under systemd: just exit(0) — Restart=always handles re-launch
     - Not under systemd: spawn `process.execPath` with `process.argv.slice(1)`, detached, stdio ignore, unref, then exit(0)

  5. **Important: Don't wait for ALL active jobs to finish — just the current STEP.** The requirement says "finish current job step, then re-exec itself." The SIGHUP handler should:
     - Set `this.shuttingDown = true` (reuse existing mechanism — this already prevents new steps from starting in the launch() for-loop)
     - Set `this.reloading = true` (new flag to differentiate from regular shutdown)
     - The existing `while (this.activeJobs.size > 0)` loop will wait for currently-executing steps to complete
     - When jobs finish their current step, `launch()` will see `shuttingDown=true` and break the for-loop, which means activeJobs will drain
     - After drain, the re-exec logic kicks in

  Do NOT:
  - Kill any running opencode processes (they are detached, unref'd — they survive the daemon exit)
  - Use file watchers or polling for change detection
  - Make the PID file path configurable — hardcode to `path.join(config.pilotDir, 'daemon.pid')`
  </action>
  <verify>
  - `grep -n 'daemon.pid' src/core/runner.ts` shows PID file write and cleanup
  - `grep -n 'SIGHUP' src/core/runner.ts` shows the handler
  - `grep -n 'reloading' src/core/runner.ts` shows the re-exec logic
  - `npx tsc --noEmit` passes
  </verify>
  <done>Runner writes ~/.pilot/daemon.pid on startup, removes on exit, handles SIGHUP by draining current steps then re-execing (or exiting for systemd restart).</done>
</task>

<task type="auto">
  <name>Task 2: Add `pilot reload` command and extend postbuild to signal daemon</name>
  <files>src/commands/reload.ts, src/index.ts, package.json</files>
  <action>
  **A. Create `src/commands/reload.ts`:**

  Export a `reloadCommand` function that:
  1. Reads `~/.pilot/daemon.pid` (path from `getConfig().pilotDir + '/daemon.pid'`)
  2. If file doesn't exist → `outputHuman('No daemon running (no PID file)')` and return (exit 0, not an error)
  3. Parse PID as integer
  4. Check if process is alive: `process.kill(pid, 0)` in try/catch
  5. If not alive → remove stale PID file, print `'Stale PID file removed (daemon not running)'`, return
  6. If alive → `process.kill(pid, 'SIGHUP')`, print `'✓ Sent reload signal to daemon (PID ${pid})'`
  7. Handle `--json` mode: output `{ timestamp, action: 'reload', pid, status: 'signaled' | 'not_running' }`

  Use `outputHuman` and `outputJson` from `../util/output.js`. Import `green` from `../util/colors.js` for the checkmark.

  **B. Wire in `src/index.ts`:**

  Add the `reload` command registration (after the `run` command block, in the Infrastructure section):
  ```typescript
  program
    .command('reload')
    .description('Signal running daemon to reload after build')
    .action(async () => {
      const { reloadCommand } = await import('./commands/reload.js');
      await reloadCommand();
    });
  ```

  **C. Extend postbuild in `package.json`:**

  The current postbuild script handles shebang + chmod. Extend it to ALSO read the PID file and send SIGHUP. The postbuild must be a single `node -e` invocation. Append this logic to the existing script:

  ```javascript
  // After existing shebang/chmod logic:
  try {
    const pidFile = require('path').join(require('os').homedir(), '.pilot', 'daemon.pid');
    const pid = parseInt(require('fs').readFileSync(pidFile, 'utf8').trim(), 10);
    process.kill(pid, 'SIGHUP');
    console.log('\\x1b[32m✓\\x1b[0m Signaled daemon reload (PID ' + pid + ')');
  } catch(e) {
    // No daemon running or stale PID — silent no-op
  }
  ```

  Note: postbuild uses `require()` because it's a `node -e` inline script (not part of ESM module system). This is fine.

  The try/catch wrapping the entire PID-read-and-signal block ensures this is a complete no-op if no daemon is running (ENOENT on readFileSync) or if PID is stale (ESRCH on process.kill). No error output in these cases.

  Do NOT:
  - Make the signal command exit non-zero if no daemon is running (it's a no-op, not an error)
  - Add debouncing logic (unnecessary complexity for this use case — builds are infrequent)
  - Use execa or spawn for the signal — `process.kill()` is the correct Node.js API for sending signals
  </action>
  <verify>
  - `npx tsc --noEmit` passes
  - `npm run build` succeeds and postbuild runs without error (even with no daemon running)
  - `node -e "const {reloadCommand} = require('./dist/commands/reload.js')"` — module loads (or use bun equivalent)
  - `grep 'SIGHUP' package.json` shows the signal in postbuild
  - `grep 'reload' src/index.ts` shows the command registration
  </verify>
  <done>`pilot reload` sends SIGHUP to daemon PID, `npm run build` postbuild does the same automatically, both are silent no-ops when no daemon is running.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — full type check passes
2. `npm run build` — builds and postbuild runs cleanly (no daemon running = silent)
3. Manual smoke test:
   - Start daemon: `pilot run --daemon &`
   - Verify PID file: `cat ~/.pilot/daemon.pid`
   - Run build: `npm run build` — should see "Signaled daemon reload" message
   - Daemon should log "SIGHUP received" to stderr and restart
   - `pilot reload` — should send signal manually
   - Kill daemon, run `pilot reload` — should say "No daemon running"
</verification>

<success_criteria>
- Runner writes ~/.pilot/daemon.pid on startup and removes on clean exit
- SIGHUP handler gracefully drains current step then re-execs
- Running opencode processes are NOT killed during reload
- `npm run build` automatically signals daemon reload via postbuild
- `pilot reload` command works for manual reload
- No-daemon cases are silent no-ops (exit 0)
</success_criteria>

<output>
After completion, create `.planning/quick/011-daemon-hot-reload-after-build-problem-whe/011-SUMMARY.md`
</output>
