/**
 * Smart-add core logic: scope detection, project state detection,
 * requirements parsing, and internal mode resolution.
 *
 * Pure core module — no UI dependencies. Functions are pure or async
 * with minimal I/O (file access checks, queue parsing).
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from './config.js';
import { detectPlanningState } from './projects.js';
import { getItems } from './queue-store.js';
import type {
  SmartAddScope,
  ScopeDetectionResult,
  ProjectStateResult,
  PilotConfig,
} from './types.js';

// ── Regex patterns ─────────────────────────────────────────────────────────

/** Matches unchecked checkbox items: `- [ ] something` */
const UNCHECKED_ITEM_RE = /^\s*- \[ \]/;

/** Matches phase section headers: `## Phase 1`, `# Phase 2: Setup`, `### Phase 3` */
const PHASE_HEADER_RE = /^#{1,3}\s+Phase\s+\d+/i;

/** Matches Must Have section headers: `## Must Have` or `### Must Have` */
const MUST_HAVE_RE = /^#{2,3}\s+Must Have/i;

// ── parseRequirementsFile ──────────────────────────────────────────────────

/**
 * Parse requirements markdown content to extract item count and
 * detect phase-level structure (phase headers or multiple Must Have sections).
 *
 * Pure function — no I/O.
 */
function parseRequirementsFile(content: string): { itemCount: number; hasPhaseHeaders: boolean } {
  const lines = content.split('\n');
  let itemCount = 0;
  let phaseHeaderCount = 0;
  let mustHaveCount = 0;

  for (const line of lines) {
    if (UNCHECKED_ITEM_RE.test(line)) {
      itemCount++;
    }
    if (PHASE_HEADER_RE.test(line)) {
      phaseHeaderCount++;
    }
    if (MUST_HAVE_RE.test(line)) {
      mustHaveCount++;
    }
  }

  // Phase headers detected if explicit phase sections exist,
  // or if multiple Must Have sections indicate milestone-level scope
  const hasPhaseHeaders = phaseHeaderCount > 0 || mustHaveCount >= 2;

  return { itemCount, hasPhaseHeaders };
}

// ── detectScope ────────────────────────────────────────────────────────────

interface DetectScopeOptions {
  content: string | null;
  description: string | null;
  isDirectory: boolean;
}

/**
 * Classify input as milestone, phase, or quick task based on heuristics.
 *
 * Pure function — no I/O.
 */
function detectScope(opts: DetectScopeOptions): ScopeDetectionResult {
  const { content, description, isDirectory } = opts;

  // Directory of requirements → milestone
  if (isDirectory) {
    return {
      scope: 'milestone',
      itemCount: 0,
      hasPhaseHeaders: false,
      isDirectory: true,
      rationale: 'Directory of requirements files detected',
    };
  }

  // File content provided → parse and classify
  if (content !== null) {
    const { itemCount, hasPhaseHeaders } = parseRequirementsFile(content);

    if (itemCount >= 10 && hasPhaseHeaders) {
      return {
        scope: 'milestone',
        itemCount,
        hasPhaseHeaders,
        isDirectory: false,
        rationale: `${itemCount} requirement items with phase/section headers`,
      };
    }

    if (itemCount >= 3) {
      return {
        scope: 'phase',
        itemCount,
        hasPhaseHeaders,
        isDirectory: false,
        rationale: `${itemCount} requirement items (focused feature)`,
      };
    }

    return {
      scope: 'quick',
      itemCount,
      hasPhaseHeaders,
      isDirectory: false,
      rationale: `${itemCount} items (small task)`,
    };
  }

  // String description, no file → quick
  if (description !== null) {
    return {
      scope: 'quick',
      itemCount: 0,
      hasPhaseHeaders: false,
      isDirectory: false,
      rationale: 'String description (no requirements file)',
    };
  }

  // Fallback
  return {
    scope: 'quick',
    itemCount: 0,
    hasPhaseHeaders: false,
    isDirectory: false,
    rationale: 'No input provided, defaulting to quick',
  };
}

// ── generateRequirementsContent ────────────────────────────────────────────

/**
 * Generate a minimal valid requirements markdown file from a string description.
 *
 * Pure function — no I/O.
 */
function generateRequirementsContent(description: string): string {
  // Title-case: capitalize first letter of each word (up to ~6 words)
  const words = description.split(/\s+/).slice(0, 6);
  const title = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `# ${title}

## Problem
${description}

## Requirements
### Must Have
- [ ] ${description}

## Do NOT
- Break existing functionality
`;
}

// ── detectProjectState ─────────────────────────────────────────────────────

/**
 * Detect project state: existence, setup status, planning state, queue status.
 *
 * Async — performs file system checks and queue file parsing.
 */
async function detectProjectState(project: string, config?: PilotConfig): Promise<ProjectStateResult> {
  const resolvedConfig = config ?? getConfig();
  const projectDir = path.join(resolvedConfig.projectDir, project);

  const result: ProjectStateResult = {
    exists: false,
    hasOpencode: false,
    hasPlanning: false,
    allPhasesDone: false,
    phasesIncomplete: false,
    isQueued: false,
    isRunning: false,
    queuedMode: null,
    runningPhase: null,
    needsSetup: false,
    needsInit: false,
  };

  // Check project directory exists
  try {
    await access(projectDir);
  } catch {
    return result;
  }

  result.exists = true;

  // Check .opencode/ exists
  try {
    await access(path.join(projectDir, '.opencode'));
    result.hasOpencode = true;
  } catch {
    // .opencode missing
  }

  // Check .planning/ exists
  try {
    await access(path.join(projectDir, '.planning'));
    result.hasPlanning = true;
  } catch {
    // .planning missing
  }

  // Determine setup/init needs
  result.needsSetup = result.exists && !result.hasOpencode;
  result.needsInit = result.exists && result.hasOpencode && !result.hasPlanning;

  // If .planning/ exists, check planning state
  if (result.hasPlanning) {
    try {
      const planningState = await detectPlanningState(path.join(projectDir, '.planning'));
      if (planningState.state === 'complete') {
        result.allPhasesDone = true;
      } else if (planningState.state === 'active') {
        result.phasesIncomplete = true;
      }
    } catch {
      // Ignore planning state detection errors
    }
  }

  // Check queue status
  try {
    const items = await getItems();
    for (const item of items) {
      if (item.project === project) {
        if (item.status === 'queued') {
          result.isQueued = true;
          result.queuedMode = item.mode;
        }
        if (item.status === 'running') {
          result.isRunning = true;
          result.runningPhase = item.description || null;
        }
      }
    }
  } catch {
    // Queue store may not exist — not an error
  }

  return result;
}

// ── resolveInternalMode ────────────────────────────────────────────────────

/**
 * Map scope + project state to the correct internal GSD mode.
 *
 * Pure function — no I/O.
 */
function resolveInternalMode(scope: SmartAddScope, projectState: ProjectStateResult): string {
  // Project doesn't exist → always build-full (will create + init)
  if (!projectState.exists) {
    return 'build-full';
  }

  // Quick tasks bypass all state checks
  if (scope === 'quick') {
    return 'quick';
  }

  // Milestone scope
  if (scope === 'milestone') {
    if (!projectState.hasPlanning) {
      return 'build-full';
    }
    if (projectState.allPhasesDone) {
      return 'build-full';
    }
    if (projectState.phasesIncomplete) {
      return 'continue-all';
    }
    return 'build-full';
  }

  // Phase scope
  if (scope === 'phase') {
    if (!projectState.hasPlanning) {
      return 'build-full';
    }
    return 'add-and-build';
  }

  // Fallback
  return 'build-full';
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
  detectScope,
  detectProjectState,
  parseRequirementsFile,
  generateRequirementsContent,
  resolveInternalMode,
};
