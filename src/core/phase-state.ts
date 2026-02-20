/**
 * Phase state detection with explicit STATE files + inference fallback.
 *
 * Port of bash `get_phase_state` from gsd-queue-v5.sh.
 * Detects the current state of a phase (needs-plan, needs-execute,
 * needs-verify, needs-gaps, done) by checking:
 *   1. Explicit STATE file in phase directory (preferred)
 *   2. UAT file analysis (fallback)
 *   3. Plan file counting (fallback)
 *   4. Git commit history (fallback)
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import type { PhaseState } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pad a phase number to 2 digits: 3 → "03", 12 → "12".
 */
function padPhase(phase: number): string {
  return String(phase).padStart(2, '0');
}

/**
 * Files to exclude when counting "plan" .md files in a phase directory.
 * These are not plan files.
 */
const EXCLUDED_MD_PATTERNS = [
  /-UAT\.md$/i,
  /-UAT\.prev\.md$/i,
  /VERIFICATION/i,
  /SUMMARY/i,
  /CONTEXT/i,
  /RESEARCH/i,
  /^STATE$/,
];

/**
 * Check if a filename should be excluded from plan file counts.
 */
function isExcludedMd(filename: string): boolean {
  return EXCLUDED_MD_PATTERNS.some((pattern) => pattern.test(filename));
}

// ── findPhaseDir ───────────────────────────────────────────────────────────

/**
 * Find the phase directory by phase number.
 *
 * Looks for directories matching `${padded}-*` in .planning/phases/.
 * Also tries unpadded number for backward compat.
 * Returns the full path or null if not found.
 */
async function findPhaseDir(projectDir: string, phase: number): Promise<string | null> {
  const phasesDir = path.join(projectDir, '.planning', 'phases');
  const padded = padPhase(phase);

  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch {
    return null;
  }

  // Try padded first (03-name), then unpadded (3-name)
  const candidates = [padded, String(phase)];

  for (const prefix of candidates) {
    const match = entries.find((name) => name.startsWith(prefix + '-'));
    if (match !== undefined) {
      return path.join(phasesDir, match);
    }
  }

  return null;
}

// ── getLastPhase ───────────────────────────────────────────────────────────

/**
 * Find the highest phase number from .planning/phases/ directory names.
 *
 * Parses directory names like "03-name" → 3, "12-deployment" → 12.
 * Used by add-and-build mode to detect newly added phases.
 * Returns 0 if no phases found.
 */
async function getLastPhase(projectDir: string): Promise<number> {
  const phasesDir = path.join(projectDir, '.planning', 'phases');

  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch {
    return 0;
  }

  let maxPhase = 0;
  for (const name of entries) {
    const match = /^(\d+)-/.exec(name);
    if (match !== null) {
      const num = parseInt(match[1]!, 10);
      if (num > maxPhase) {
        maxPhase = num;
      }
    }
  }

  return maxPhase;
}

// ── writePhaseState ────────────────────────────────────────────────────────

/**
 * Write an explicit state string to the phase directory's STATE file.
 *
 * Valid states: planning, planned, executing, executed, verifying, verified, needs-gaps
 *
 * Creates the STATE file if it doesn't exist.
 * Requires the phase directory to already exist.
 */
async function writePhaseState(
  projectDir: string,
  phase: number,
  state: string,
): Promise<void> {
  const phaseDir = await findPhaseDir(projectDir, phase);
  if (phaseDir === null) {
    throw new Error(
      `Phase directory not found for phase ${phase} in ${projectDir}`,
    );
  }
  const statePath = path.join(phaseDir, 'STATE');
  await writeFile(statePath, state, 'utf8');
}

// ── getPhaseState ──────────────────────────────────────────────────────────

/**
 * Detect the current state of a phase.
 *
 * Checks STATE file first, then falls back to inference from filesystem
 * and git history. Mirrors bash get_phase_state logic.
 *
 * Returns one of: 'needs-plan' | 'needs-execute' | 'needs-verify' | 'needs-gaps' | 'done'
 */
async function getPhaseState(projectDir: string, phase: number): Promise<PhaseState> {
  // Step 1: Find phase directory
  const phaseDir = await findPhaseDir(projectDir, phase);
  if (phaseDir === null) {
    return 'needs-plan';
  }

  // Step 2: Check for explicit STATE file
  const stateFromFile = await readStateFile(phaseDir);
  if (stateFromFile !== null) {
    return mapExplicitState(stateFromFile, phaseDir);
  }

  // Step 3: Fall back to inference
  return inferPhaseState(projectDir, phaseDir, phase);
}

// ── STATE file reading ─────────────────────────────────────────────────────

/**
 * Read the STATE file from a phase directory.
 * Returns the trimmed content or null if not found.
 */
async function readStateFile(phaseDir: string): Promise<string | null> {
  try {
    const content = await readFile(path.join(phaseDir, 'STATE'), 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Map an explicit STATE file value to a PhaseState.
 *
 * - planning / planned → check if plans exist
 * - executing → needs-execute (was interrupted)
 * - executed → needs-verify
 * - verifying → needs-verify (was interrupted)
 * - verified → done
 * - needs-gaps → needs-gaps
 */
async function mapExplicitState(state: string, phaseDir: string): Promise<PhaseState> {
  switch (state) {
    case 'planning':
    case 'planned': {
      // Check if actual plan files exist
      const planCount = await countPlanFiles(phaseDir);
      return planCount > 0 ? 'needs-execute' : 'needs-plan';
    }

    case 'executing':
      return 'needs-execute';

    case 'executed':
      return 'needs-verify';

    case 'verifying':
      return 'needs-verify';

    case 'verified':
      return 'done';

    case 'needs-gaps':
      return 'needs-gaps';

    default:
      // Unknown state — fall through to inference would be complex here,
      // so return needs-plan as safe default
      return 'needs-plan';
  }
}

// ── Inference fallback ─────────────────────────────────────────────────────

/**
 * Infer phase state from filesystem and git history.
 * Used when no explicit STATE file exists (backward compatibility).
 */
async function inferPhaseState(
  projectDir: string,
  phaseDir: string,
  phase: number,
): Promise<PhaseState> {
  // Step 3a: Check UAT file
  const uatResult = await checkUatFile(phaseDir);
  if (uatResult !== null) {
    return uatResult;
  }

  // Step 3b: Count plan files
  const planCount = await countPlanFiles(phaseDir);
  if (planCount === 0) {
    return 'needs-plan';
  }

  // Step 3c: Check git commits for execution evidence
  const hasCommits = await checkPhaseCommits(projectDir, phase);
  if (hasCommits) {
    return 'needs-verify';
  }

  return 'needs-execute';
}

// ── UAT file checking ──────────────────────────────────────────────────────

/**
 * Check for a UAT file and parse its results.
 *
 * - If UAT exists with 0 failures → 'done'
 * - If UAT exists with failures > 0 → 'needs-gaps'
 * - If no UAT → null (continue inference)
 */
async function checkUatFile(phaseDir: string): Promise<PhaseState | null> {
  let entries: string[];
  try {
    entries = await readdir(phaseDir);
  } catch {
    return null;
  }

  // Find UAT file (exclude .prev.md files — those are stale)
  const uatFile = entries.find(
    (name) => name.endsWith('-UAT.md') && !name.endsWith('.prev.md'),
  );

  if (uatFile === undefined) {
    return null;
  }

  const uatPath = path.join(phaseDir, uatFile);
  let content: string;
  try {
    content = await readFile(uatPath, 'utf8');
  } catch {
    return null;
  }

  // Count failures in UAT content
  const failures = countUatFailures(content);
  return failures === 0 ? 'done' : 'needs-gaps';
}

/**
 * Count failures in UAT file content.
 *
 * Looks for:
 * - Lines with `result: fail` (case-insensitive)
 * - Lines with `failed: N` or `issues: N` where N > 0
 */
function countUatFailures(content: string): number {
  let failures = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Check for explicit "result: fail"
    if (/^result:\s*fail/i.test(trimmed)) {
      failures++;
    }

    // Check for "failed: N" or "issues: N" with N > 0
    const failedMatch = /^(?:failed|issues):\s*(\d+)/i.exec(trimmed);
    if (failedMatch !== null) {
      const count = parseInt(failedMatch[1]!, 10);
      if (count > 0) {
        failures += count;
      }
    }
  }

  return failures;
}

// ── Plan file counting ─────────────────────────────────────────────────────

/**
 * Count .md files in a phase directory that are actual plan files.
 * Excludes UAT, VERIFICATION, SUMMARY, CONTEXT, RESEARCH, STATE files.
 */
async function countPlanFiles(phaseDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(phaseDir);
  } catch {
    return 0;
  }

  return entries.filter((name) => {
    if (!name.endsWith('.md')) {
      return false;
    }
    return !isExcludedMd(name);
  }).length;
}

// ── Git commit checking ────────────────────────────────────────────────────

/**
 * Check git log for commits that indicate phase execution.
 *
 * Looks at the last 20 commits for patterns:
 *   - `(feat|fix|refactor|chore)(${padded}` — conventional commits with phase scope
 *   - `phase.?${padded}` or `phase.?${phaseNum}` — phase references
 *
 * Returns true if execution evidence found.
 */
async function checkPhaseCommits(projectDir: string, phase: number): Promise<boolean> {
  const padded = padPhase(phase);

  try {
    const result = await execa('git', ['log', '--oneline', '-20'], {
      cwd: projectDir,
    });

    const log = result.stdout;
    if (log.length === 0) {
      return false;
    }

    // Pattern 1: conventional commit with phase scope
    // e.g., feat(03-01): ... or fix(03-02): ...
    const conventionalPattern = new RegExp(
      `(feat|fix|refactor|chore)\\(${padded}`,
    );

    // Pattern 2: phase reference in message
    // e.g., "phase 3" or "phase 03" or "phase-3"
    const phaseRefPattern = new RegExp(
      `phase.?${padded}|phase.?${phase}`,
      'i',
    );

    return conventionalPattern.test(log) || phaseRefPattern.test(log);
  } catch {
    return false;
  }
}

export {
  getPhaseState,
  writePhaseState,
  findPhaseDir,
  getLastPhase,
};
