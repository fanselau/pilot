/**
 * pilot add <project> <requirement-or-description> — Smart add to queue.
 *
 * Reads input (file, directory, or description string), detects scope
 * (milestone/phase/quick) via smart-add core logic, resolves the correct
 * internal GSD mode, handles project setup if needed, and writes to
 * QUEUE.md via withQueueLock.
 *
 * Users never see GSD modes — scope detection and mode resolution are
 * internal implementation details.
 */

import { stat, readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import {
  detectScope,
  detectProjectState,
  generateRequirementsContent,
  resolveInternalMode,
} from '../core/smart-add.js';
import { withQueueLock } from '../core/lock.js';
import { setupProject } from '../core/setup.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { dim, yellow } from '../util/colors.js';
import type { SmartAddScope, ScopeDetectionResult } from '../core/types.js';

// ── AddResult type ─────────────────────────────────────────────────────────

export interface AddResult {
  project: string;
  scope: SmartAddScope;
  internalMode: string;
  description: string;
  requirementsPath: string | null;
  dryRun: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_SCOPE_OVERRIDES = ['quick', 'phase', 'milestone'] as const;

/**
 * Create a URL-safe slug from a description string.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Extract the first markdown heading from content, or fall back to filename.
 */
function extractDescription(content: string, fallback: string): string {
  const match = /^#+\s+(.+)$/m.exec(content);
  return match ? match[1]! : fallback;
}

// ── addCommand ─────────────────────────────────────────────────────────────

export async function addCommand(
  project: string,
  input: string,
  opts: Record<string, unknown>,
): Promise<AddResult> {
  const config = getConfig();
  const projectDir = path.join(config.projectDir, project);

  // ── Step 1: Determine input type ────────────────────────────────────────

  let isDir = false;
  let isFile = false;
  let content: string | null = null;
  let requirementsPath: string | null = null;
  let description: string = input;

  const inputPath = path.resolve(input);

  try {
    const stats = await stat(inputPath);
    if (stats.isDirectory()) {
      isDir = true;
      requirementsPath = inputPath;
      // Count .md files for description
      const files = await readdir(inputPath);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      description = `${mdFiles.length} requirements files in ${path.basename(inputPath)}/`;
    } else if (stats.isFile()) {
      isFile = true;
      requirementsPath = inputPath;
      content = await readFile(inputPath, 'utf8');
      description = extractDescription(content, path.basename(inputPath, '.md'));
    }
  } catch {
    // stat() failed → treat as string description
    content = null;
    requirementsPath = null;
    description = input;
  }

  // ── Step 2: Check --as scope override ───────────────────────────────────

  const scopeOverride = opts['as'] as string | undefined;
  if (scopeOverride !== undefined) {
    if (!VALID_SCOPE_OVERRIDES.includes(scopeOverride as typeof VALID_SCOPE_OVERRIDES[number])) {
      process.stderr.write(
        `Error: Invalid scope '${scopeOverride}'. Valid: ${VALID_SCOPE_OVERRIDES.join(', ')}\n`,
      );
      process.exit(2);
    }
  }

  // ── Step 3: Detect scope ────────────────────────────────────────────────

  let scopeResult: ScopeDetectionResult;

  if (scopeOverride !== undefined) {
    // Build manual ScopeDetectionResult from override
    scopeResult = {
      scope: scopeOverride as SmartAddScope,
      itemCount: 0,
      hasPhaseHeaders: false,
      isDirectory: isDir,
      rationale: `--as ${scopeOverride} override`,
    };
  } else {
    scopeResult = detectScope({ content, description, isDirectory: isDir });
  }

  // ── Step 4: Detect project state ────────────────────────────────────────

  const projectState = await detectProjectState(project, config);

  // ── Step 5: Handle missing project directory ────────────────────────────

  if (!projectState.exists) {
    process.stderr.write(`Error: Project directory not found: ${projectDir}\n`);
    process.exit(1);
  }

  // ── Step 6: Auto-setup if .opencode/ missing ───────────────────────────

  if (projectState.needsSetup) {
    if (!isJsonMode()) {
      outputHuman(`${dim('→')} Running setup for ${project}...`);
    }
    await setupProject(projectDir);
  }

  // ── Step 7: Warn if already queued/running ─────────────────────────────

  if (!isJsonMode()) {
    if (projectState.isQueued) {
      outputHuman(yellow(`⚠ ${project} is already queued (${projectState.queuedMode})`));
    }
    if (projectState.isRunning) {
      outputHuman(yellow(`⚠ ${project} is currently running (${projectState.runningPhase ?? 'unknown'}). Queuing after completion.`));
    }
  }

  // ── Step 8: Handle requirements file ────────────────────────────────────

  if (requirementsPath !== null && isFile) {
    // If source is outside projectDir, copy to <projectDir>/requirements/
    if (!requirementsPath.startsWith(projectDir)) {
      const reqDir = path.join(projectDir, 'requirements');
      await mkdir(reqDir, { recursive: true });
      const destPath = path.join(reqDir, path.basename(requirementsPath));
      await copyFile(requirementsPath, destPath);
      requirementsPath = destPath;
    }
  }

  // ── Step 9: Generate requirements file for non-quick string input ──────

  if (content === null && !isDir && scopeResult.scope !== 'quick') {
    const generatedContent = generateRequirementsContent(description);
    const reqDir = path.join(projectDir, 'requirements');
    await mkdir(reqDir, { recursive: true });
    const safeName = slugify(description) || 'requirement';
    const destPath = path.join(reqDir, `${safeName}.md`);
    await writeFile(destPath, generatedContent);
    requirementsPath = destPath;
  }

  // ── Step 10: Resolve internal mode ──────────────────────────────────────

  const internalMode = resolveInternalMode(scopeResult.scope, projectState);

  // ── Step 11: Log scope detection decision ───────────────────────────────

  if (!isJsonMode()) {
    outputHuman(`${dim('→')} Detected: ${scopeResult.scope} (${scopeResult.rationale})`);
  }

  // ── Step 12: Dry-run check ──────────────────────────────────────────────

  if (opts['dryRun'] === true) {
    if (isJsonMode()) {
      outputJson({
        action: 'dry-run',
        project,
        scope: scopeResult.scope,
        internalMode,
        description,
        requirementsPath,
      });
    } else {
      outputHuman(`Dry run — would queue:`);
      outputHuman(`  Project: ${project}`);
      outputHuman(`  Scope: ${scopeResult.scope}`);
      outputHuman(`  Mode: ${internalMode}`);
      outputHuman(`  Description: ${description}`);
      if (requirementsPath) {
        outputHuman(`  Requirements: ${requirementsPath}`);
      }
    }
    return {
      project,
      scope: scopeResult.scope,
      internalMode,
      description,
      requirementsPath,
      dryRun: true,
    };
  }

  // ── Step 13: Write to QUEUE.md ──────────────────────────────────────────

  const argsStr = description || '';
  const entryLine = argsStr.length > 0
    ? `## ${project} | ${internalMode} | ${argsStr}`
    : `## ${project} | ${internalMode}`;

  await withQueueLock(async () => {
    const queueContent = await readFile(config.queueFile, 'utf8').catch(() => '');
    const newContent = queueContent.trimEnd() + '\n\n' + entryLine + '\n';
    await writeFile(config.queueFile, newContent);
  });

  // ── Step 14: Output result ──────────────────────────────────────────────

  if (!isJsonMode()) {
    outputHuman(`✓ Queued: ${project} | ${scopeResult.scope} → ${internalMode}`);
    if (requirementsPath) {
      outputHuman(`  Requirements: ${requirementsPath}`);
    }
    outputHuman(`Run ${dim('pilot run')} to start building`);
  }

  return {
    project,
    scope: scopeResult.scope,
    internalMode,
    description,
    requirementsPath,
    dryRun: false,
  };
}
