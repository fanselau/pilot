---
status: partial
phase: 92-pilot-web-ui-native-subsession-flow-actual-implementation-follow-up
source: [92-VERIFICATION.md]
started: 2026-03-23T18:15:00Z
updated: 2026-03-23T18:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Confirm subsession content is visually flattened — no extra nested gutter visible in real job data
expected: Subsession content sits at the same left position as step-level text/tool items. No visible 'extra lane' or stacked left-borders for subsession content.
result: [pending]

### 2. Confirm sticky headers stack correctly on scroll
expected: When scrolling into a subsession, its header pins below the step header. Nested sub-subsessions stack headers below parent subsession header.
result: [pending]

### 3. Confirm follow mode works inside expanded subsessions
expected: On a running job with active subsessions, follow mode scrolls to newest content even when that content is inside an open subsession. 80px upward scroll cancels follow mode; 'Follow latest' bar re-engages.
result: [pending]

### 4. Confirm the UI is materially different from pre-phase-92 state
expected: The job detail view with nested subsessions/subagents looks distinctly different — subsession content is integrated, not a separate nested widget.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
