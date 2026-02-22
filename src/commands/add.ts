/**
 * `pilot add <project> <requirement>` — Queue work with auto-detected scope.
 *
 * Scope detection:
 *   - File path → phase (reads title from markdown heading)
 *   - Directory → milestone (uses dir basename)
 *   - Short string → quick
 *
 * For quick scope with file requirement, passes FULL file content as description.
 */

import { accessSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { addJob } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim } from '../util/colors.js';
import type { JobScope } from '../core/types.js';

interface AddOptions {
  as?: JobScope;
  next?: boolean;
  json?: boolean;
}

function isFilePath(str: string): boolean {
  try {
    accessSync(str);
    return statSync(str).isFile();
  } catch {
    return false;
  }
}

function isDirPath(str: string): boolean {
  try {
    return statSync(str).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detect scope from requirement type:
 *   - File path → phase
 *   - Directory → milestone
 *   - Short string → quick
 */
function detectScope(requirement: string): JobScope {
  if (isFilePath(requirement)) return 'phase';
  if (isDirPath(requirement)) return 'milestone';
  return 'quick';
}

async function addCommand(
  project: string,
  requirement: string,
  opts: AddOptions,
): Promise<void> {
  const scope = opts.as ?? detectScope(requirement);

  let description = requirement;
  let requirementPath: string | null = null;

  if (isFilePath(requirement)) {
    requirementPath = path.resolve(requirement);
    const content = readFileSync(requirementPath, 'utf8');
    // Extract title from first markdown heading
    const title = content.match(/^#\s+(.+)/m)?.[1];
    description = title ?? path.basename(requirement, '.md');
  } else if (isDirPath(requirement)) {
    requirementPath = path.resolve(requirement);
    description = path.basename(requirementPath);
  }

  // For quick scope with file requirement, pass FULL content as description
  if (scope === 'quick' && requirementPath !== null) {
    description = readFileSync(requirementPath, 'utf8');
  }

  const job = addJob(project, scope, description, requirementPath ?? undefined);

  if (isJsonMode()) {
    outputJson({ job });
    return;
  }

  const shortDesc = description.length > 60 ? description.slice(0, 60) + '…' : description;
  outputHuman(`  ${green('✓')} Queued: ${project} · ${scope} · "${shortDesc}"  ${dim(`(id: ${job.id})`)}`);
  outputHuman(`  ${dim('Run:')} pilot service start ${dim('to process queue')}`);
}

export { addCommand, detectScope };
