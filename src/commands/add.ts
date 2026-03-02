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

import { accessSync, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { addJob } from '../core/db.js';
import { getConfig } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim, yellow } from '../util/colors.js';
import type { JobScope, ModelProfile, ProviderMode } from '../core/types.js';

const VALID_PROFILES: readonly ModelProfile[] = ['quality', 'balanced', 'budget'];
const VALID_PROVIDERS: readonly ProviderMode[] = ['hybrid', 'claude-only', 'openai-only'];

interface AddOptions {
  as?: JobScope;
  next?: boolean;
  json?: boolean;
  profile?: string;
  provider?: string;
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
  // Validate --profile
  const modelProfile: ModelProfile | undefined = opts.profile
    ? validateProfile(opts.profile)
    : undefined;

  // Validate --provider
  const providerMode: ProviderMode | undefined = opts.provider
    ? validateProvider(opts.provider)
    : undefined;

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

  // R5: Warn when phase scope auto-detected but no matching phase in ROADMAP
  if (scope === 'phase' && !opts.as && isFilePath(requirement)) {
    const projectDir = path.join(getConfig().projectDir, project);
    const roadmapPath = path.join(projectDir, '.planning', 'ROADMAP.md');

    if (existsSync(roadmapPath)) {
      try {
        const roadmap = readFileSync(roadmapPath, 'utf8');
        const descLower = description.toLowerCase();
        const hasMatch = roadmap.toLowerCase().includes(descLower.slice(0, 30));

        if (!hasMatch) {
          process.stderr.write(
            `\n  ${yellow('⚠')}  No matching phase found for "${description.slice(0, 50)}"\n` +
            `     The delegate AI will create a new phase. To override:\n` +
            `       pilot add ${project} "${requirement}" --as quick    # run as quick task\n` +
            `       pilot add ${project} "${requirement}" --as milestone  # full milestone\n\n`,
          );
        }
      } catch {
        // Can't read ROADMAP — skip warning silently
      }
    }
  }

  const job = addJob(project, scope, description, requirementPath ?? undefined, modelProfile, providerMode);

  if (isJsonMode()) {
    outputJson({ job });
    return;
  }

  const shortDesc = description.length > 60 ? description.slice(0, 60) + '…' : description;
  // Append non-default profile/provider as dim tag
  const tags: string[] = [];
  if (modelProfile && modelProfile !== 'balanced') tags.push(modelProfile);
  if (providerMode && providerMode !== 'claude-only') tags.push(providerMode);
  const tagStr = tags.length > 0 ? `  ${dim(`[${tags.join('/')}]`)}` : '';

  outputHuman(`  ${green('✓')} Queued: ${project} · ${scope} · "${shortDesc}"${tagStr}  ${dim(`(id: ${job.id})`)}`);
  outputHuman(`  ${dim('Run:')} pilot service start ${dim('to process queue')}`);
}

function validateProfile(value: string): ModelProfile {
  if (!VALID_PROFILES.includes(value as ModelProfile)) {
    process.stderr.write(`Error: Invalid profile "${value}". Must be one of: ${VALID_PROFILES.join(', ')}\n`);
    process.exit(2);
  }
  return value as ModelProfile;
}

function validateProvider(value: string): ProviderMode {
  if (!VALID_PROVIDERS.includes(value as ProviderMode)) {
    process.stderr.write(`Error: Invalid provider "${value}". Must be one of: ${VALID_PROVIDERS.join(', ')}\n`);
    process.exit(2);
  }
  return value as ProviderMode;
}

export { addCommand, detectScope };
