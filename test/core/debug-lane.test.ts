import { describe, expect, it } from 'vitest';
import {
  buildDebugPrompt,
  parseDebugOutcome,
  buildContinuationPrompt,
} from '../../src/core/debug-lane.js';

// ── buildDebugPrompt ───────────────────────────────────────────────────────

describe('buildDebugPrompt', () => {
  it('includes symptoms_prefilled: true', () => {
    const result = buildDebugPrompt({ description: 'some bug', slug: 'some-bug' });
    expect(result).toContain('symptoms_prefilled: true');
  });

  it('includes goal: find_and_fix', () => {
    const result = buildDebugPrompt({ description: 'some bug', slug: 'some-bug' });
    expect(result).toContain('goal: find_and_fix');
  });

  it('includes the description/issue summary', () => {
    const result = buildDebugPrompt({ description: 'memory leak in queue', slug: 'memory-leak' });
    expect(result).toContain('memory leak in queue');
  });

  it('includes debug file path with slug', () => {
    const result = buildDebugPrompt({ description: 'test bug', slug: 'test-bug' });
    expect(result).toContain('.planning/debug/test-bug.md');
  });

  it('includes symptoms when provided', () => {
    const result = buildDebugPrompt({
      description: 'some bug',
      symptoms: 'Error: ENOENT at line 42',
      slug: 'some-bug',
    });
    expect(result).toContain('Error: ENOENT at line 42');
  });

  it('does not include empty symptoms block when symptoms not provided', () => {
    const result = buildDebugPrompt({ description: 'some bug', slug: 'some-bug' });
    // Should not have a <symptoms> tag with nothing meaningful inside
    expect(result).not.toMatch(/<symptoms>\s*<\/symptoms>/);
  });

  it('includes autonomous investigation goal line', () => {
    const result = buildDebugPrompt({ description: 'some bug', slug: 'some-bug' });
    expect(result).toMatch(/investigate.*autonomous|autonomous.*fix|self.verify/i);
  });
});

// ── parseDebugOutcome ──────────────────────────────────────────────────────

describe('parseDebugOutcome', () => {
  it('returns root_cause_found for ## ROOT CAUSE FOUND header', () => {
    const content = `
## ROOT CAUSE FOUND

**Debug Session:** .planning/debug/some-bug.md

**Root Cause:** memory leak in queue processor

**Evidence Summary:**
- Found unclosed file handles
- Memory grows monotonically

**Files Involved:**
- src/core/queue.ts: unclosed handle

**Suggested Fix Direction:** Close handles in finally block
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('root_cause_found');
    if (outcome.type === 'root_cause_found') {
      expect(outcome.rootCause).toBe('memory leak in queue processor');
    }
  });

  it('returns debug_complete for ## DEBUG COMPLETE header', () => {
    const content = `
## DEBUG COMPLETE

**Debug Session:** .planning/debug/resolved/some-bug.md

**Root Cause:** memory leak in queue processor
**Fix Applied:** Added finally block to close handles
**Verification:** Memory stable over 100 iterations

**Files Changed:**
- src/core/queue.ts: added finally block

**Commit:** abc1234
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('debug_complete');
    if (outcome.type === 'debug_complete') {
      expect(outcome.rootCause).toBe('memory leak in queue processor');
      expect(outcome.commit).toBe('abc1234');
    }
  });

  it('returns investigation_inconclusive for ## INVESTIGATION INCONCLUSIVE header', () => {
    const content = `
## INVESTIGATION INCONCLUSIVE

**Debug Session:** .planning/debug/some-bug.md

**What Was Checked:**
- src/core/queue.ts: no issues found
- src/core/runner.ts: no issues found

**Hypotheses Eliminated:**
- Race condition: no evidence found
- Memory leak: not observed

**Remaining Possibilities:**
- External service issue
- Data corruption

**Recommendation:** Manual review needed by senior engineer
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('investigation_inconclusive');
    if (outcome.type === 'investigation_inconclusive') {
      expect(outcome.recommendation).toContain('Manual review');
    }
  });

  it('returns checkpoint with checkpointType human-verify for ## CHECKPOINT REACHED with Type: human-verify', () => {
    const content = `
## CHECKPOINT REACHED

**Type:** human-verify
**Debug Session:** .planning/debug/some-bug.md
**Progress:** 5 evidence entries, 2 hypotheses eliminated

### Investigation State

**Current Hypothesis:** memory leak from unclosed handles

### Checkpoint Details

**Need verification:** confirm the original issue is resolved
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('checkpoint');
    if (outcome.type === 'checkpoint') {
      expect(outcome.checkpointType).toBe('human-verify');
    }
  });

  it('returns checkpoint with checkpointType human-action for ## CHECKPOINT REACHED with Type: human-action', () => {
    const content = `
## CHECKPOINT REACHED

**Type:** human-action
**Debug Session:** .planning/debug/some-bug.md
**Progress:** 3 evidence entries, 1 hypothesis eliminated

### Checkpoint Details

**Action needed:** authenticate to external service
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('checkpoint');
    if (outcome.type === 'checkpoint') {
      expect(outcome.checkpointType).toBe('human-action');
    }
  });

  it('returns checkpoint with checkpointType decision for ## CHECKPOINT REACHED with Type: decision', () => {
    const content = `
## CHECKPOINT REACHED

**Type:** decision
**Debug Session:** .planning/debug/some-bug.md
**Progress:** 2 evidence entries, 0 hypotheses eliminated

### Checkpoint Details

**Decision needed:** which investigation path to take
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('checkpoint');
    if (outcome.type === 'checkpoint') {
      expect(outcome.checkpointType).toBe('decision');
    }
  });

  it('returns unknown when no recognized header found', () => {
    const outcome = parseDebugOutcome('no structured output here - just some random text from the session');
    expect(outcome.type).toBe('unknown');
    if (outcome.type === 'unknown') {
      expect(outcome.rawContent).toBeTruthy();
    }
  });

  it('returns unknown for empty string', () => {
    const outcome = parseDebugOutcome('');
    expect(outcome.type).toBe('unknown');
  });

  it('extracts evidence summary as array for root_cause_found', () => {
    const content = `
## ROOT CAUSE FOUND

**Root Cause:** type error in handler

**Evidence Summary:**
- Found null reference at line 42
- Confirmed by adding logs

**Files Involved:**
- src/handler.ts: null check missing

**Suggested Fix Direction:** Add null guard
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('root_cause_found');
    if (outcome.type === 'root_cause_found') {
      expect(outcome.evidence).toContain('Found null reference at line 42');
    }
  });

  it('extracts files changed as array for debug_complete', () => {
    const content = `
## DEBUG COMPLETE

**Root Cause:** null pointer
**Fix Applied:** added null check
**Verification:** tests pass

**Files Changed:**
- src/handler.ts: null check
- src/types.ts: updated type

**Commit:** def5678
`;
    const outcome = parseDebugOutcome(content);
    expect(outcome.type).toBe('debug_complete');
    if (outcome.type === 'debug_complete') {
      expect(outcome.filesChanged).toContain('src/handler.ts: null check');
    }
  });
});

// ── buildContinuationPrompt ────────────────────────────────────────────────

describe('buildContinuationPrompt', () => {
  it('includes "confirmed fixed" (case-insensitive) in the prompt', () => {
    const result = buildContinuationPrompt({
      slug: 'some-bug',
      debugFilePath: '.planning/debug/some-bug.md',
    });
    expect(result.toLowerCase()).toContain('confirmed fixed');
  });

  it('includes the debug file path', () => {
    const result = buildContinuationPrompt({
      slug: 'some-bug',
      debugFilePath: '.planning/debug/some-bug.md',
    });
    expect(result).toContain('.planning/debug/some-bug.md');
  });

  it('includes mode block with symptoms_prefilled: true', () => {
    const result = buildContinuationPrompt({
      slug: 'some-bug',
      debugFilePath: '.planning/debug/some-bug.md',
    });
    expect(result).toContain('symptoms_prefilled: true');
  });

  it('includes goal: find_and_fix', () => {
    const result = buildContinuationPrompt({
      slug: 'some-bug',
      debugFilePath: '.planning/debug/some-bug.md',
    });
    expect(result).toContain('goal: find_and_fix');
  });

  it('mentions resume and checkpoint', () => {
    const result = buildContinuationPrompt({
      slug: 'some-bug',
      debugFilePath: '.planning/debug/some-bug.md',
    });
    expect(result.toLowerCase()).toMatch(/resume|checkpoint/);
  });
});
