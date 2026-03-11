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
import { addJob, findDuplicateJob, getProject, updateJobCategories } from '../core/db.js';
import { resolveProjectDir, getConfig, getConfigFileDefaults } from '../core/config.js';
import { resolveNotifyRoute } from '../core/notify-route.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim, yellow } from '../util/colors.js';
import { getProviderMode, getProviderModes } from '../core/model-store.js';
import type { Job, JobScope, ModelProfile, OpenClawDeliverRoute } from '../core/types.js';

const VALID_PROFILES: readonly ModelProfile[] = ['quality', 'balanced', 'budget'];
const BUILTIN_PROVIDERS = ['hybrid', 'claude-only', 'openai-only'] as const;

interface AddOptions {
  as?: JobScope;
  next?: boolean;
  json?: boolean;
  profile?: string;
  provider?: string;
  force?: boolean;
  forceDirty?: boolean;
  timeout?: number;   // Per-job timeout in minutes (0 = infinite, default)
  notify?: string;    // Agent ID to notify on completion (e.g. "main")
  notifyUrl?: string; // Custom webhook URL for completion callback
  noNotify?: boolean; // Explicitly skip completion notification
  dryRun?: boolean;   // Show what would happen without queuing
  categories?: string; // Skill categories for this job (comma-separated string from CLI)
  startImmediately?: boolean; // Bypass queue grace wait for this job
}

function parseCategoriesInput(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  const parsed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return parsed;
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
 *
 * Returns scope and a brief reason for the detection.
 */
function detectScope(requirement: string): JobScope {
  return detectScopeWithReason(requirement).scope;
}

function detectScopeWithReason(requirement: string): { scope: JobScope; reason: string } {
  if (isFilePath(requirement)) return { scope: 'phase', reason: 'requirement is a file' };
  if (isDirPath(requirement)) return { scope: 'milestone', reason: 'requirements directory' };

  // Long descriptions are likely requirements, not quick fixes
  if (requirement.length > 100) return { scope: 'phase', reason: 'long description (>100 chars)' };

  // Requirements-like language patterns suggest phase scope
  const requirementsPatterns = /\b(implement|build|create|add|integrate|migrate|refactor|redesign|overhaul|set\s?up|introduce)\b/i;
  if (requirementsPatterns.test(requirement)) return { scope: 'phase', reason: 'requirements-like description' };

  return { scope: 'quick', reason: 'short description' };
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

  // Resolve model profile: flag > config file default
  const configDefaults = getConfigFileDefaults();
  const modelProfile: ModelProfile = opts.profile
    ? validateProfile(opts.profile)
    : configDefaults.modelProfile;

  // Resolve provider mode: flag > config file default
  const providerMode = opts.provider
    ? validateProvider(opts.provider)
    : configDefaults.providerMode;

  let scope: JobScope;
  if (opts.as) {
    scope = opts.as;
  } else {
    const detected = detectScopeWithReason(requirement);
    scope = detected.scope;
    if (!isJsonMode()) {
      process.stderr.write(`  Detected scope: ${detected.scope} (${detected.reason})\n`);
    }
  }

  // Parse categories from --categories flag (comma-separated string)
  const categories = parseCategoriesInput(opts.categories);
  if (opts.categories !== undefined && (!categories || categories.length === 0)) {
    process.stderr.write('Error: --categories must include at least one category (e.g. frontend,testing)\n');
    process.exit(2);
  }

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
    // File size limit: reject files larger than 1MB
    const fileSize = statSync(requirementPath).size;
    if (fileSize > 1_048_576) {
      process.stderr.write(`Error: Requirement file exceeds 1MB limit (${Math.round(fileSize / 1024)}KB): ${requirementPath}\n`);
      process.exit(1);
    }
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

  const projectRecord = getProject(resolvedProject);

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
    } else if (projectRecord?.owner) {
      resolvedNotifyKey = projectRecord.owner;
    } else {
      // No notify intent — resolvedNotifyKey stays undefined (notifications disabled)
      // Print informational hint in human mode (not an error)
      if (!opts.dryRun && !isJsonMode()) {
        outputHuman(`  ${dim('ℹ Notifications not configured. See: pilot add --help')}`);
      }
    }
  }

  // Warn if project is not registered (non-blocking — one-off jobs are valid)
  if (!projectRecord) {
    process.stderr.write(
      `  ⚠ Project not registered. Run: pilot setup ${resolvedProject} --owner <agentId>\n`,
    );
  }

  // --dry-run: preview only — do NOT write to DB
  if (opts.dryRun) {
    const shortDesc = description.length > 60 ? description.slice(0, 60) + '…' : description;
    outputHuman(`  ${dim('[dry-run]')} Would queue: ${project} · ${scope} · "${shortDesc}"`);
    if (resolvedNotifyKey) {
      outputHuman(`  ${dim(`notify → ${resolvedNotifyKey}`)}`);
    }
    outputHuman(`  ${dim('Project:')} ${resolvedProject}`);
    return;
  }

  let notifyRouteSnapshot: OpenClawDeliverRoute | null | undefined;
  if (!opts.noNotify && resolvedNotifyKey !== undefined) {
    const configuredRoute = projectRecord?.notifyOpenClawRoute;
    if (opts.notify && configuredRoute && opts.notify !== configuredRoute.agentId) {
      process.stderr.write(
        `Error: --notify (${opts.notify}) conflicts with configured project route agent (${configuredRoute.agentId}). `
        + `Use --notify ${configuredRoute.agentId}, remove --notify, or update the project route with `
        + `pilot project "${resolvedProject}" --notify-openclaw ...\n`,
      );
      process.exit(2);
    }

    const routeResolution = resolveNotifyRoute(
      {
        callbackSessionKey: resolvedNotifyKey ?? null,
        notifyRoute: null,
      } as Job,
      projectRecord,
    );
    if (!routeResolution.ok) {
      process.stderr.write(`Error: ${routeResolution.error.message}\n`);
      process.stderr.write(
        `Configure a structured route: pilot project "${resolvedProject}" --notify-openclaw --notify-agent <id> --notify-channel <channel> --notify-to <target> [--notify-account <id>]\n`,
      );
      process.exit(2);
    }

    notifyRouteSnapshot = routeResolution.route;
  }

  const job = opts.startImmediately
    ? (notifyRouteSnapshot
      ? addJob(
        resolvedProject,
        scope,
        description,
        requirementPath ?? undefined,
        modelProfile,
        providerMode,
        undefined,             // dependsOn (not used in add command)
        undefined,             // parentJobId (not used in add command)
        resolvedNotifyKey,     // callbackSessionKey (resolved)
        opts.notifyUrl,        // callbackUrl
        opts.timeout ?? 0,     // timeout in minutes (0 = infinite)
        opts.forceDirty ?? false,
        true,
        notifyRouteSnapshot,
      )
      : addJob(
        resolvedProject,
        scope,
        description,
        requirementPath ?? undefined,
        modelProfile,
        providerMode,
        undefined,             // dependsOn (not used in add command)
        undefined,             // parentJobId (not used in add command)
        resolvedNotifyKey,     // callbackSessionKey (resolved)
        opts.notifyUrl,        // callbackUrl
        opts.timeout ?? 0,     // timeout in minutes (0 = infinite)
        opts.forceDirty ?? false,
        true,
      ))
    : (notifyRouteSnapshot
      ? addJob(
        resolvedProject,
        scope,
        description,
        requirementPath ?? undefined,
        modelProfile,
        providerMode,
        undefined,             // dependsOn (not used in add command)
        undefined,             // parentJobId (not used in add command)
        resolvedNotifyKey,     // callbackSessionKey (resolved)
        opts.notifyUrl,        // callbackUrl
        opts.timeout ?? 0,     // timeout in minutes (0 = infinite)
        opts.forceDirty ?? false,
        undefined,
        notifyRouteSnapshot,
      )
      : addJob(
        resolvedProject,
        scope,
        description,
        requirementPath ?? undefined,
        modelProfile,
        providerMode,
        undefined,             // dependsOn (not used in add command)
        undefined,             // parentJobId (not used in add command)
        resolvedNotifyKey,     // callbackSessionKey (resolved)
        opts.notifyUrl,        // callbackUrl
        opts.timeout ?? 0,     // timeout in minutes (0 = infinite)
        opts.forceDirty ?? false,
      ));

  // Store categories on the job record if provided
  if (categories && categories.length > 0) {
    updateJobCategories(job.id, categories);
  }

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
  if (categories && categories.length > 0) {
    outputHuman(`  ${dim('Categories: ' + categories.join(', '))}`);
  }
  if (opts.timeout && opts.timeout > 0) {
    outputHuman(`  ${dim(`Timeout: ${opts.timeout}m`)}`);
  }
  if (opts.forceDirty) {
    outputHuman(`  ${yellow('⚠')} Starting with dirty worktree (--force-dirty). Recovery guarantees are weaker for this job.`);
  }
  if (opts.startImmediately) {
    outputHuman(`  ${yellow('⚠')} Start mode: immediate (--start-immediately) — faster start, less review/cancel time.`);
  } else {
    outputHuman('  Start mode: waits for queue grace window before launch.');
  }
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

function validateProvider(value: string): string {
  // Accept built-in modes directly
  if ((BUILTIN_PROVIDERS as readonly string[]).includes(value)) return value;

  // Check DB for custom provider modes (graceful fallback)
  try {
    if (getProviderMode(value)) return value;
  } catch {
    // DB unavailable — only accept built-in modes
    process.stderr.write(`Error: Unknown provider "${value}". Built-in modes: ${BUILTIN_PROVIDERS.join(', ')}. DB unavailable for custom mode lookup.\n`);
    process.exit(2);
  }

  // If not found in built-in or DB, list all available modes
  let availableList = `Built-in: ${BUILTIN_PROVIDERS.join(', ')}`;
  try {
    const allModes = getProviderModes();
    const customModes = allModes.filter((m) => m.is_builtin === 0).map((m) => m.name);
    if (customModes.length > 0) {
      availableList += `. Custom: ${customModes.join(', ')}`;
    }
  } catch {
    // Ignore — already have built-in list
  }
  process.stderr.write(`Error: Unknown provider "${value}". ${availableList}. Create custom modes with: pilot models add-provider <name>\n`);
  process.exit(2);
}

export { addCommand, detectScope };
