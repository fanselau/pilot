# Smart Tail / Log-Based Stuck Detection

## Problem

The `verify-auto` agent ran for 66 minutes on a non-web project (pilot-gsd is just markdown files). It correctly identified there's nothing to browser-test, wrote that conclusion to the log at minute 1, then sat idle for 65 minutes. The log file timestamp and content clearly showed the process was done thinking but hadn't exited.

Current stuck detection only checks:
- Log file staleness (last modified time)
- CPU usage
- Process state

It misses a critical signal: **what the log actually says**.

## Goal

`pilot tail` and `pilot stuck` should detect "semantically stuck" processes — where the log content itself reveals the process is confused, waiting for input, or has finished its work but hasn't exited.

## Requirements

### Must Have
- [ ] `pilot tail --smart` analyzes the last N lines of a running job's log for stuck signals:
  - Questions being asked ("Would you like me to...", "Should I...", "Do you want...")
  - Process declaring work done but not exiting ("Phase X complete", "verification complete", "all tests passed")  
  - Process declaring inapplicability ("not applicable", "no web UI", "nothing to test", "no routes")
  - Long gap between last log write and current time (existing, but weighted higher when combined with content signals)
- [ ] Stuck scoring integrates log content analysis as a new signal type (weight ~25)
- [ ] `pilot stuck` includes a `reason` field when log content signals are detected, e.g.: "Process declared verification not applicable 65 min ago but hasn't exited"
- [ ] `pilot tail` highlights stuck-signal lines in the output (color/prefix)

### Nice to Have
- [ ] Pattern library is configurable (regex patterns in pilot config)
- [ ] `pilot stuck --auto-kill` uses log content to make smarter kill decisions (e.g., if process said "not applicable", safe to kill immediately rather than waiting for threshold)
- [ ] Historical pattern learning — track which log patterns preceded manual kills

## Technical Notes

- Log files are at `/tmp/gsd-{project}-{command}.log`
- Current stuck scoring is in `core/stuck.ts` with weighted multi-signal approach
- This adds a 6th signal: `logContent` alongside `logStaleness`, `cpuTrend`, `sessionMessages`, `memory`, `procState`
- Simple substring/regex matching is fine for v1 — no need for LLM analysis of logs
- Keep pattern list small and high-precision to avoid false positives

## Do NOT
- Use LLM/AI to analyze log content — too slow and expensive for a monitoring loop
- Make this the primary stuck signal — it's supplementary to time-based detection
- Parse structured output (JSON) from logs — they're unstructured terminal output with ANSI codes
