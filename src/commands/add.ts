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

import { accessSync, existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { addJob, findDuplicateJob } from '../core/db.js';
import { resolveProjectDir, getConfig } from '../core/config.js';
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
  force?: boolean;
  notify?: string;    // OpenClaw session key to wake on completion
  notifyUrl?: string; // Custom webhook URL for completion callback
  noNotify?: boolean; // Explicitly skip completion notification
  dryRun?: boolean;   // Show what would happen without queuing
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
 * Validate that a project has been set up with `pilot setup` before queuing.
 *
 * Accepts the resolved absolute project directory path (not the raw project name).
 *
 * Checks:
 * - .opencode/command/ exists (symlink or directory)
 * - .opencode/agents/ exists (symlink or directory)
 * - If symlink: target actually resolves (not broken)
 * - opencode.json (or claude.json) exists — warn-only, does NOT block
 *
 * Exits with code 1 if misconfigured (unless force=true).
 */
function validateProjectSetup(projectDir: string, force: boolean): void {
  if (force) return;

  // Check critical symlinks/dirs: command and agents
  const criticalDirs = ['command', 'agents'] as const;
  for (const dirName of criticalDirs) {
    const dirPath = path.join(projectDir, '.opencode', dirName);

    // Use lstatSync first — it stats the link itself (not the target), so it
    // works even for broken symlinks. existsSync follows the link and returns
    // false for broken symlinks, masking the "broken setup" case.
    let linkStats: ReturnType<typeof lstatSync> | null = null;
    try {
      linkStats = lstatSync(dirPath);
    } catch {
      // Path doesn't exist at all — not configured
      process.stderr.write(
        `  ✗ Project "${projectDir}" not configured. Run: pilot setup <project>\n`,
      );
      process.exit(1);
    }

    // If it IS a symlink, verify the target exists (not broken)
    if (linkStats.isSymbolicLink()) {
      try {
        realpathSync(dirPath);
      } catch {
        process.stderr.write(
          `  ✗ Project "${projectDir}" has broken setup (symlink target missing). Run: pilot setup <project>\n`,
        );
        process.exit(1);
      }
    }
    // If it's a real directory, existsSync already confirmed it's there — accept it
  }

  // Warn-only: check for opencode.json / claude.json
  const configFiles = ['opencode.json', 'claude.json'];
  const hasConfig = configFiles.some((f) => existsSync(path.join(projectDir, f)));
  if (!hasConfig) {
    process.stderr.write(
      `  ⚠ Project "${projectDir}" has no opencode.json. Run: pilot setup <project>\n`,
    );
  }
}

/**
 * Detect scope from requirement type:
 *   - File path → phase
 *   - Directory → milestone
 *   - Long string (>100 chars) → phase (likely a requirement description)
 *   - String with requirements-like verbs → phase
 *   - Short imperative string → quick
 */
function detectScope(requirement: string): JobScope {
  if (isFilePath(requirement)) return 'phase';
  if (isDirPath(requirement)) return 'milestone';

  // Long descriptions are likely requirements, not quick fixes
  if (requirement.length > 100) return 'phase';

  // Requirements-like language patterns suggest phase scope
  const requirementsPatterns = /\b(implement|build|create|add|integrate|migrate|refactor|redesign|overhaul|set\s?up|introduce)\b/i;
  if (requirementsPatterns.test(requirement)) return 'phase';

  return 'quick';
}

async function addCommand(
  project: string,
  requirement: string,
  opts: AddOptions,
): Promise<void> {
  // Resolve project to absolute path once — all downstream code uses resolvedProject
  const resolvedProject = resolveProjectDir(project);

  // Validate project setup before doing anything else
  validateProjectSetup(resolvedProject, opts.force ?? false);

  // Validate --profile
  const modelProfile: ModelProfile | undefined = opts.profile
    ? validateProfile(opts.profile)
    : undefined;

  // Validate --provider
  const providerMode: ProviderMode | undefined = opts.provider
    ? validateProvider(opts.provider)
    : undefined;

  const scope = opts.as ?? detectScope(requirement);

  // Warn when quick scope is used (explicitly or auto-detected) — encourage phase
  if (scope === 'quick' && !isJsonMode()) {
    process.stderr.write(
      `  ${yellow('⚠')} Quick mode skips planning. Consider phase mode for better results:\n` +
      `    pilot add ${project} ${requirement.includes(' ') ? `"${requirement.slice(0, 50)}"` : requirement} --as phase\n\n`,
    );
  }

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

  // Duplicate check: skip if --force is set
  if (!opts.force) {
    const existing = findDuplicateJob(resolvedProject, description, requirementPath ?? undefined);
    if (existing) {
      if (isJsonMode()) {
        outputJson({ duplicate: true, existingJob: existing });
        return;
      }
      const statusLabel = existing.status === 'completed' ? 'recently completed' : existing.status === 'running' ? 'running' : 'queued';
      outputHuman(`  ${yellow('⚠')} Job already ${statusLabel}: ${dim(existing.id)} — "${existing.description.length > 50 ? existing.description.slice(0, 50) + '…' : existing.description}"`);
      outputHuman(`  ${dim('Use --force to queue anyway')}`);
      return;  // exit cleanly — not an error
    }
  }

  // R5: Warn when phase scope auto-detected but no matching phase in ROADMAP
  if (scope === 'phase' && !opts.as && isFilePath(requirement)) {
    const roadmapPath = path.join(resolvedProject, '.planning', 'ROADMAP.md');

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

  // Resolve notify target:
  //   1. --no-notify → skip notification (callbackSessionKey = undefined)
  //   2. --notify <key> → use that key
  //   3. Neither → check PILOT_DEFAULT_NOTIFY env var
  //   4. Still nothing and NOT --dry-run → error
  //   5. --dry-run → skip the requirement entirely
  let resolvedNotifyKey: string | undefined;
  if (opts.noNotify) {
    // Explicitly opted out — no callback
    resolvedNotifyKey = undefined;
  } else if (opts.notify) {
    // --notify <key> takes precedence
    resolvedNotifyKey = opts.notify;
  } else {
    // Check env var fallback
    const defaultKey = getConfig().defaultNotifySessionKey;
    if (defaultKey) {
      resolvedNotifyKey = defaultKey;
    } else if (!opts.dryRun) {
      // No notify intent and not a dry run — require explicit declaration
      process.stderr.write(
        'Missing --notify <sessionKey>. Use --no-notify to explicitly skip notification.\n',
      );
      process.exit(2);
    }
    // dry-run case: resolvedNotifyKey stays undefined — no error
  }

  const job = addJob(
    resolvedProject, scope, description,
    requirementPath ?? undefined,
    modelProfile, providerMode,
    undefined,             // dependsOn (not used in add command)
    undefined,             // parentJobId (not used in add command)
    resolvedNotifyKey,     // callbackSessionKey (resolved)
    opts.notifyUrl,        // callbackUrl
  );

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
  if (resolvedNotifyKey) {
    outputHuman(`  ${dim(`notify → ${resolvedNotifyKey}`)}`);
  }
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
