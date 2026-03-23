/**
 * Debug lane module for Pilot.
 *
 * Provides caller-side orchestration for autonomous gsd-debugger sessions:
 * - buildDebugPrompt: construct prefilled inline prompt for initial debug session
 * - parseDebugOutcome: parse structured gsd-debugger returns from session transcript
 * - buildContinuationPrompt: construct inline prompt for autonomous continuation after human-verify
 *
 * This module keeps debug jobs entirely in the debug lifecycle — never touching
 * phase-style judge logic or requiring interactive user input.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type DebugOutcome =
  | { type: 'root_cause_found'; rootCause: string; evidence: string[]; files: string[]; suggestedFix: string }
  | { type: 'debug_complete'; rootCause: string; fix: string; verification: string; filesChanged: string[]; commit: string }
  | { type: 'investigation_inconclusive'; checked: string[]; eliminated: string[]; remaining: string[]; recommendation: string }
  | { type: 'checkpoint'; checkpointType: 'human-verify' | 'human-action' | 'decision'; sessionFile: string; progress: string; details: string }
  | { type: 'unknown'; rawContent: string };

// ── Prompt Builders ────────────────────────────────────────────────────────

/**
 * Build an inline prompt for gsd-debugger with prefilled context.
 * Uses the inline prompt pattern (same as judge sessions) — NOT --command flag.
 */
export function buildDebugPrompt(opts: {
  description: string;
  symptoms?: string;
  slug: string;
}): string {
  const { description, symptoms, slug } = opts;
  const debugFilePath = `.planning/debug/${slug}.md`;

  const symptomsBlock = symptoms
    ? `\n<symptoms>\n${symptoms}\n</symptoms>\n`
    : '';

  return `You are being spawned as gsd-debugger to autonomously investigate and fix a bug.

<issue>
${description}
</issue>
${symptomsBlock}
<debug_file>${debugFilePath}</debug_file>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

Investigate and fix this issue autonomously. Self-verify your fix. After verification, return a structured ## DEBUG COMPLETE or ## CHECKPOINT REACHED result.`;
}

/**
 * Build an inline prompt for a continuation gsd-debugger session after human-verify checkpoint.
 * Provides the autonomous equivalent of "confirmed fixed" so the debugger can finalize/archive/commit.
 */
export function buildContinuationPrompt(opts: {
  slug: string;
  debugFilePath: string;
}): string {
  const { debugFilePath } = opts;

  return `You are being spawned as gsd-debugger to finalize a debug session.

<debug_file>${debugFilePath}</debug_file>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

Read the debug file at ${debugFilePath} to understand the current state.

The self-verification checks have passed. Confirmed fixed.

Resume from the awaiting_human_verify checkpoint. The fix has been confirmed. Finalize: archive the session and commit the fix. Return ## DEBUG COMPLETE when done.`;
}

// ── Outcome Parser ─────────────────────────────────────────────────────────

/**
 * Parse structured gsd-debugger returns from session transcript content.
 * Searches for recognized ## HEADER patterns and extracts fields.
 * Returns { type: 'unknown' } when no recognized header is found.
 */
export function parseDebugOutcome(content: string): DebugOutcome {
  if (!content || content.trim().length === 0) {
    return { type: 'unknown', rawContent: '' };
  }

  // Check for ## DEBUG COMPLETE (check before ROOT CAUSE to avoid partial matches)
  if (/^##\s+DEBUG COMPLETE/m.test(content)) {
    return parseDebugComplete(content);
  }

  // Check for ## ROOT CAUSE FOUND
  if (/^##\s+ROOT CAUSE FOUND/m.test(content)) {
    return parseRootCauseFound(content);
  }

  // Check for ## INVESTIGATION INCONCLUSIVE
  if (/^##\s+INVESTIGATION INCONCLUSIVE/m.test(content)) {
    return parseInvestigationInconclusive(content);
  }

  // Check for ## CHECKPOINT REACHED
  if (/^##\s+CHECKPOINT REACHED/m.test(content)) {
    return parseCheckpointReached(content);
  }

  // No recognized structured return
  return { type: 'unknown', rawContent: content.slice(0, 500) };
}

// ── Private Parsers ────────────────────────────────────────────────────────

/**
 * Extract a single bold field value: **FieldName:** value
 * Returns empty string if not found.
 */
function extractField(content: string, fieldName: string): string {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n##|\\n\\n|$)`, 's');
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

/**
 * Extract a bullet list following a bold header.
 * Returns array of trimmed bullet items (without leading "- ").
 */
function extractBulletList(content: string, headerName: string): string[] {
  // Find the header section
  const headerPattern = new RegExp(`\\*\\*${headerName}:\\*\\*\\s*\\n((?:\\s*-[^\\n]*\\n?)+)`, 's');
  const match = content.match(headerPattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(line => line.length > 0);
}

function parseRootCauseFound(content: string): DebugOutcome {
  const rootCause = extractField(content, 'Root Cause');
  const evidence = extractBulletList(content, 'Evidence Summary');
  const files = extractBulletList(content, 'Files Involved');
  const suggestedFix = extractField(content, 'Suggested Fix Direction');

  return {
    type: 'root_cause_found',
    rootCause: rootCause || 'Unknown root cause',
    evidence,
    files,
    suggestedFix: suggestedFix || '',
  };
}

function parseDebugComplete(content: string): DebugOutcome {
  const rootCause = extractField(content, 'Root Cause');
  const fix = extractField(content, 'Fix Applied');
  const verification = extractField(content, 'Verification');
  const filesChanged = extractBulletList(content, 'Files Changed');
  const commit = extractField(content, 'Commit');

  return {
    type: 'debug_complete',
    rootCause: rootCause || 'Unknown root cause',
    fix: fix || '',
    verification: verification || '',
    filesChanged,
    commit: commit || '',
  };
}

function parseInvestigationInconclusive(content: string): DebugOutcome {
  const checked = extractBulletList(content, 'What Was Checked');
  const eliminated = extractBulletList(content, 'Hypotheses Eliminated');
  const remaining = extractBulletList(content, 'Remaining Possibilities');
  const recommendation = extractField(content, 'Recommendation');

  return {
    type: 'investigation_inconclusive',
    checked,
    eliminated,
    remaining,
    recommendation: recommendation || 'Manual review needed',
  };
}

function parseCheckpointReached(content: string): DebugOutcome {
  const typeField = extractField(content, 'Type');
  const sessionFile = extractField(content, 'Debug Session');
  const progress = extractField(content, 'Progress');

  // Extract everything after ### Checkpoint Details
  const detailsMatch = content.match(/###\s+Checkpoint Details\s*\n([\s\S]*?)(?=###|$)/);
  const details = detailsMatch ? detailsMatch[1].trim() : '';

  // Normalize checkpoint type
  let checkpointType: 'human-verify' | 'human-action' | 'decision' = 'human-verify';
  const normalizedType = typeField.toLowerCase().trim();
  if (normalizedType === 'human-action') {
    checkpointType = 'human-action';
  } else if (normalizedType === 'decision') {
    checkpointType = 'decision';
  } else if (normalizedType === 'human-verify') {
    checkpointType = 'human-verify';
  }

  return {
    type: 'checkpoint',
    checkpointType,
    sessionFile: sessionFile || '',
    progress: progress || '',
    details,
  };
}
