/**
 * Project type detection and verify strategy routing.
 *
 * Classifies projects as web, CLI, or file-content based on filesystem
 * signals, then routes verification to the appropriate strategy.
 *
 * Detection order: web signals checked first (highest priority),
 * then CLI signals, then file-content as default fallback.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectType, VerifyStrategy } from './types.js';

// ── Web signal patterns ─────────────────────────────────────────────────

const WEB_DEV_PATTERNS = [
  'vite',
  'next',
  'remix',
  'nuxt',
  'astro',
  'webpack-dev-server',
  'react-scripts start',
];

const WEB_START_PATTERNS = [
  'node server',
  'express',
  'fastify',
  'http-server',
];

const WEB_DEPENDENCY_NAMES = [
  'next',
  'remix',
  'nuxt',
  'astro',
  'vite',
];

const WEB_PORT_PATTERNS = [
  'localhost',
  ':3000',
  ':8080',
  ':5173',
];

const JSX_TSX_DIRS = ['src', 'app', 'pages'];

// ── Helpers ─────────────────────────────────────────────────────────────

function containsAny(text: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan directories for .jsx/.tsx files (shallow: up to 2 levels deep).
 * Returns true if any JSX/TSX file is found.
 */
async function hasJsxTsxFiles(projectDir: string): Promise<boolean> {
  for (const dir of JSX_TSX_DIRS) {
    const dirPath = join(projectDir, dir);
    if (!(await dirExists(dirPath))) continue;

    try {
      // Level 1: direct children
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(jsx|tsx)$/.test(entry.name)) {
          return true;
        }
        // Level 2: one level deeper
        if (entry.isDirectory()) {
          try {
            const subEntries = await readdir(join(dirPath, entry.name), { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (subEntry.isFile() && /\.(jsx|tsx)$/.test(subEntry.name)) {
                return true;
              }
            }
          } catch {
            // Ignore unreadable subdirectories
          }
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }
  return false;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: Record<string, string> | string;
}

interface DetectionResult {
  type: ProjectType;
  reason: string;
}

// ── Core detection ──────────────────────────────────────────────────────

/**
 * Detect project type based on filesystem signals.
 *
 * Checked in order (first match wins):
 * 1. Web signals → 'web'
 * 2. CLI signals → 'cli'
 * 3. Default → 'file-content'
 */
export async function detectProjectType(projectDir: string): Promise<ProjectType> {
  const result = await detectProjectTypeWithReason(projectDir);
  return result.type;
}

async function detectProjectTypeWithReason(projectDir: string): Promise<DetectionResult> {
  // Try to read package.json
  let pkg: PackageJson | null = null;
  try {
    const raw = await readFile(join(projectDir, 'package.json'), 'utf-8');
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    return { type: 'file-content', reason: 'no package.json found' };
  }

  const pkgString = JSON.stringify(pkg);

  // ── Web signal checks ───────────────────────────────────────────────

  // Check scripts.dev for web framework patterns
  const devScript = pkg.scripts?.dev ?? '';
  const devMatch = containsAny(devScript, WEB_DEV_PATTERNS);
  if (devMatch) {
    return { type: 'web', reason: `scripts.dev contains "${devMatch}"` };
  }

  // Check scripts.start for server patterns
  const startScript = pkg.scripts?.start ?? '';
  const startMatch = containsAny(startScript, WEB_START_PATTERNS);
  if (startMatch) {
    return { type: 'web', reason: `scripts.start contains "${startMatch}"` };
  }

  // Check dependencies (not devDependencies only) for web frameworks
  const deps = pkg.dependencies ?? {};
  for (const depName of WEB_DEPENDENCY_NAMES) {
    if (depName in deps) {
      return { type: 'web', reason: `dependencies contains "${depName}"` };
    }
  }

  // Check for port/localhost patterns anywhere in package.json
  const portMatch = containsAny(pkgString, WEB_PORT_PATTERNS);
  if (portMatch) {
    return { type: 'web', reason: `package.json contains "${portMatch}"` };
  }

  // Check for JSX/TSX route files
  if (await hasJsxTsxFiles(projectDir)) {
    return { type: 'web', reason: 'found JSX/TSX files in route directories' };
  }

  // ── CLI signal checks ───────────────────────────────────────────────

  // Check for bin field
  if (pkg.bin) {
    return { type: 'cli', reason: 'package.json has bin field' };
  }

  // Check for build script + src/ directory (library/tool pattern)
  if (pkg.scripts?.build && await dirExists(join(projectDir, 'src'))) {
    return { type: 'cli', reason: 'has build script and src/ directory' };
  }

  // ── Default ─────────────────────────────────────────────────────────

  return { type: 'file-content', reason: 'no web or CLI signals detected' };
}

// ── Strategy resolution ─────────────────────────────────────────────────

/**
 * Resolve verification strategy from explicit flag or auto-detection.
 *
 * @param explicit - The strategy flag value ('auto', 'browser', 'file', 'cli')
 * @param projectDir - Project directory to analyze when strategy is 'auto'
 * @returns Resolved strategy with reason string
 */
export async function resolveVerifyStrategy(
  explicit: VerifyStrategy,
  projectDir: string,
): Promise<{ strategy: ProjectType; reason: string }> {
  // Explicit strategy mappings
  switch (explicit) {
    case 'browser':
      return { strategy: 'web', reason: 'explicit --strategy flag' };
    case 'file':
      return { strategy: 'file-content', reason: 'explicit --strategy flag' };
    case 'cli':
      return { strategy: 'cli', reason: 'explicit --strategy flag' };
    case 'auto': {
      const result = await detectProjectTypeWithReason(projectDir);
      return { strategy: result.type, reason: result.reason };
    }
  }
}
