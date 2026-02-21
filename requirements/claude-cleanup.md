# Claude → Opencode Cleanup + Test Fixes

## What to do
1. In src/core/doctor.ts: replace `which claude` fallback with `which opencode`. Remove claude binary paths. Report "opencode" not "claude".
2. In src/commands/config.ts: remove claude paths from binary detection. Only check opencode paths.
3. In src/core/sessions.ts: replace `claude session list` and `claude export` with `opencode session list` and `opencode export`.
4. In src/core/cleanup.ts: keep pgrep for both opencode and claude (legacy process detection is fine).
5. In src/core/setup.ts: keep .claude as legacy fallback detection but ensure .opencode is preferred/primary.
6. Run `npx vitest run` and fix ALL failing tests until 0 failures.
