/**
 * File-content and CLI verification strategy implementations.
 *
 * These strategies allow pilot to verify non-web projects without
 * spawning an AI agent. File-content verification does grep-based
 * checks, file existence, and frontmatter validation. CLI verification
 * builds the project, runs --help, and checks the binary.
 *
 * Both strategies produce a consistent VerifyResult.
 * Neither function throws — all failures are captured as issues.
 */

import { readFile, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import type { VerifyResult } from './types.js';
import { countSummaryFiles } from './phase-state.js';

// ── Types ──────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  issue?: string;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  bin?: Record<string, string> | string;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Read and parse package.json from a project directory.
 * Returns null if not found or unparseable.
 */
async function readPackageJson(projectDir: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(path.join(projectDir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Find the phase directory for a given phase number.
 * Looks for `.planning/phases/${padded}-*` matching directories.
 */
async function findPhaseDirectory(
  projectDir: string,
  phase: number,
): Promise<string | null> {
  const phasesDir = path.join(projectDir, '.planning', 'phases');
  const padded = String(phase).padStart(2, '0');

  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch {
    return null;
  }

  const candidates = [padded, String(phase)];
  for (const prefix of candidates) {
    const match = entries.find((name) => name.startsWith(prefix + '-'));
    if (match !== undefined) {
      return path.join(phasesDir, match);
    }
  }
  return null;
}

/**
 * Parse YAML-like frontmatter from markdown content.
 *
 * Finds text between first `---` and next `---`, parses `key: value` pairs.
 * Returns { valid, keys, error? }.
 *
 * No external YAML library — simple line-by-line key: value parsing.
 */
function parseFrontmatter(content: string): {
  valid: boolean;
  keys: string[];
  error?: string;
} {
  const lines = content.split('\n');

  // First line must be ---
  if (lines.length === 0 || lines[0]!.trim() !== '---') {
    return { valid: true, keys: [] }; // No frontmatter — that's fine
  }

  // Find closing ---
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return {
      valid: false,
      keys: [],
      error: 'frontmatter missing closing --- delimiter',
    };
  }

  // Parse key: value pairs
  const keys: string[] = [];
  for (let i = 1; i < closingIndex; i++) {
    const line = lines[i]!.trim();
    if (line === '' || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      keys.push(line.substring(0, colonIdx).trim());
    }
  }

  return { valid: true, keys };
}

/**
 * Grep ROADMAP.md success criteria for a given phase.
 *
 * Extracts criterion lines (starting with `- `) from the phase's
 * Success Criteria section. For each, attempts to find matching files
 * or content in the project.
 *
 * Returns { matched, total, unmatched }.
 */
async function grepRoadmapCriteria(
  projectDir: string,
  phase: number,
): Promise<{ matched: number; total: number; unmatched: string[] }> {
  const roadmapPath = path.join(projectDir, '.planning', 'ROADMAP.md');

  let content: string;
  try {
    content = await readFile(roadmapPath, 'utf8');
  } catch {
    return { matched: 0, total: 0, unmatched: [] };
  }

  const padded = String(phase).padStart(2, '0');

  // Find the phase section
  const phasePattern = new RegExp(
    `### Phase ${phase}:|### Phase ${padded}:`,
    'i',
  );
  const phaseMatch = phasePattern.exec(content);
  if (!phaseMatch) {
    return { matched: 0, total: 0, unmatched: [] };
  }

  // Extract text from Success Criteria until next ### or end
  const afterPhase = content.substring(phaseMatch.index);
  const criteriaPattern = /\*\*Success Criteria:\*\*/i;
  const criteriaMatch = criteriaPattern.exec(afterPhase);
  if (!criteriaMatch) {
    return { matched: 0, total: 0, unmatched: [] };
  }

  const afterCriteria = afterPhase.substring(criteriaMatch.index + criteriaMatch[0].length);
  const nextSection = afterCriteria.search(/\n###\s/);
  const criteriaText =
    nextSection >= 0
      ? afterCriteria.substring(0, nextSection)
      : afterCriteria;

  // Extract lines starting with "- "
  const criteriaLines = criteriaText
    .split('\n')
    .filter((line) => line.trim().startsWith('- '))
    .map((line) => line.trim().substring(2));

  if (criteriaLines.length === 0) {
    return { matched: 0, total: 0, unmatched: [] };
  }

  // For each criterion, extract file path patterns and grep
  const unmatched: string[] = [];
  let matched = 0;

  for (const criterion of criteriaLines) {
    // Extract path-like tokens (e.g., src/core/config.ts, core/types.ts)
    const pathTokens = criterion.match(
      /(?:src\/|core\/|lib\/|test\/|dist\/)\S+/g,
    );

    if (!pathTokens || pathTokens.length === 0) {
      // No greppable file paths — skip this criterion (can't verify)
      matched++;
      continue;
    }

    let found = false;
    for (const token of pathTokens) {
      // Check if the file exists
      const filePath = path.join(projectDir, token);
      try {
        await access(filePath);
        found = true;
        break;
      } catch {
        // File doesn't exist — try src/ prefix if not already there
        if (!token.startsWith('src/')) {
          try {
            await access(path.join(projectDir, 'src', token));
            found = true;
            break;
          } catch {
            // Not found
          }
        }
      }
    }

    if (found) {
      matched++;
    } else {
      unmatched.push(criterion);
    }
  }

  return { matched, total: criteriaLines.length, unmatched };
}

/**
 * Recursively scan a directory for all files, up to a certain depth.
 * Returns relative file paths.
 */
async function scanDir(
  dirPath: string,
  _base?: string,
  _depth?: number,
): Promise<string[]> {
  const base = _base ?? dirPath;
  const depth = _depth ?? 0;
  if (depth > 3) return [];

  const files: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    try {
      const s = await stat(fullPath);
      if (s.isFile()) {
        files.push(path.relative(base, fullPath));
      } else if (s.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
        const subFiles = await scanDir(fullPath, base, depth + 1);
        files.push(...subFiles);
      }
    } catch {
      // Skip unreadable entries
    }
  }

  return files;
}

// ── File-content verification ──────────────────────────────────────────

/**
 * Run file-content verification on a project.
 *
 * Checks:
 * a. Phase directory exists
 * b. Plan files exist
 * c. Summary files exist (non-superseded)
 * d. No stub files (summaries with >10 lines)
 * e. ROADMAP success criteria grep
 * f. YAML frontmatter validation for .md files
 * g. ROADMAP consistency (phase referenced)
 * h. Test suite (if package.json has test script)
 *
 * Never throws — all failures captured as issues.
 */
async function runFileContentVerification(
  projectDir: string,
  phase: number,
): Promise<VerifyResult> {
  const checks: CheckResult[] = [];

  // a. Phase directory exists
  const phaseDir = await findPhaseDirectory(projectDir, phase);
  if (!phaseDir) {
    checks.push({
      name: 'phase-directory',
      passed: false,
      issue: `phase directory not found for phase ${phase}`,
    });
    // Can't do further checks without phase dir
    return buildResult('file-content', checks, false, null);
  }
  checks.push({ name: 'phase-directory', passed: true });

  // b. Plan files exist
  let phaseEntries: string[];
  try {
    phaseEntries = await readdir(phaseDir);
  } catch {
    phaseEntries = [];
  }

  const planFiles = phaseEntries.filter(
    (f) => f.endsWith('-PLAN.md') || (f.endsWith('.md') && f.includes('PLAN')),
  );
  if (planFiles.length === 0) {
    checks.push({
      name: 'plan-files',
      passed: false,
      issue: 'no plan files found in phase directory',
    });
  } else {
    checks.push({ name: 'plan-files', passed: true });
  }

  // c. Summary files exist (reuse countSummaryFiles)
  const summaryCount = await countSummaryFiles(phaseDir);
  if (summaryCount === 0) {
    checks.push({
      name: 'summary-files',
      passed: false,
      issue: 'no non-superseded summary files found in phase directory',
    });
  } else {
    checks.push({ name: 'summary-files', passed: true });
  }

  // d. No stub files (summaries with <10 lines)
  const summaryFiles = phaseEntries.filter((f) => f.endsWith('-SUMMARY.md'));
  let hasStub = false;
  for (const sf of summaryFiles) {
    try {
      const content = await readFile(path.join(phaseDir, sf), 'utf8');
      const lineCount = content.split('\n').length;
      if (lineCount < 10) {
        hasStub = true;
        checks.push({
          name: 'stub-check',
          passed: false,
          issue: `stub summary detected: ${sf} has only ${lineCount} lines (<10)`,
        });
      }
    } catch {
      // Can't read — skip
    }
  }
  if (!hasStub && summaryFiles.length > 0) {
    checks.push({ name: 'stub-check', passed: true });
  }

  // e. ROADMAP success criteria grep
  const criteria = await grepRoadmapCriteria(projectDir, phase);
  if (criteria.total > 0 && criteria.unmatched.length > 0) {
    // Warning-level: does NOT cause hard fail
    for (const unm of criteria.unmatched) {
      checks.push({
        name: 'roadmap-criteria-grep',
        passed: true, // warning only
        issue: `[warning] unmatched ROADMAP criterion: ${unm}`,
      });
    }
  }
  if (criteria.total > 0 && criteria.unmatched.length === 0) {
    checks.push({ name: 'roadmap-criteria-grep', passed: true });
  }

  // f. YAML frontmatter validation
  const mdFiles = phaseEntries.filter(
    (f) => f.endsWith('.md') && f.includes('PLAN'),
  );
  for (const mdFile of mdFiles) {
    try {
      const content = await readFile(path.join(phaseDir, mdFile), 'utf8');
      const fm = parseFrontmatter(content);
      if (!fm.valid) {
        checks.push({
          name: 'frontmatter-validation',
          passed: false,
          issue: `frontmatter error in ${mdFile}: ${fm.error}`,
        });
      } else if (content.trim().startsWith('---')) {
        // Has frontmatter — check required keys for PLAN files
        const requiredKeys = ['phase', 'plan'];
        const missingKeys = requiredKeys.filter((k) => !fm.keys.includes(k));
        if (missingKeys.length > 0) {
          checks.push({
            name: 'frontmatter-validation',
            passed: false,
            issue: `frontmatter in ${mdFile} missing required keys: ${missingKeys.join(', ')}`,
          });
        } else {
          checks.push({ name: 'frontmatter-validation', passed: true });
        }
      }
    } catch {
      // Can't read — skip
    }
  }

  // g. ROADMAP consistency (phase referenced in ROADMAP.md)
  try {
    const roadmap = await readFile(
      path.join(projectDir, '.planning', 'ROADMAP.md'),
      'utf8',
    );
    const padded = String(phase).padStart(2, '0');
    const phaseRef = new RegExp(
      `Phase ${phase}[:\\s]|Phase ${padded}[:\\s]`,
      'i',
    );
    if (phaseRef.test(roadmap)) {
      checks.push({ name: 'roadmap-consistency', passed: true });
    } else {
      checks.push({
        name: 'roadmap-consistency',
        passed: false,
        issue: `phase ${phase} not found in ROADMAP.md`,
      });
    }
  } catch {
    // No ROADMAP — skip this check
  }

  // h. Test suite
  const pkg = await readPackageJson(projectDir);
  const { testsRan, testsPassed } = await runTests(projectDir, pkg);

  return buildResult('file-content', checks, testsRan, testsPassed);
}

// ── CLI verification ───────────────────────────────────────────────────

/**
 * Run CLI verification on a project.
 *
 * Checks:
 * a. Build succeeds (if scripts.build exists)
 * b. Binary exists (if bin field in package.json)
 * c. Binary executable (check file permissions)
 * d. Help flag works (run binary with --help)
 * e. Test suite (if scripts.test exists)
 * f. Lint passes (if scripts.lint exists)
 *
 * Never throws — all failures captured as issues.
 */
async function runCliVerification(
  projectDir: string,
  _phase: number,
): Promise<VerifyResult> {
  const checks: CheckResult[] = [];
  const pkg = await readPackageJson(projectDir);

  // a. Build succeeds
  if (pkg?.scripts?.build) {
    try {
      const result = await execa('npm', ['run', 'build'], {
        cwd: projectDir,
        reject: false,
        timeout: 60_000,
      });
      if (result.exitCode === 0) {
        checks.push({ name: 'build', passed: true });
      } else {
        checks.push({
          name: 'build',
          passed: false,
          issue: `build failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`.substring(0, 200),
        });
      }
    } catch (err: unknown) {
      checks.push({
        name: 'build',
        passed: false,
        issue: `build error: ${err instanceof Error ? err.message : String(err)}`.substring(0, 200),
      });
    }
  }

  // b. Binary exists + c. Binary executable
  const binPath = resolveBinPath(pkg, projectDir);
  if (binPath) {
    try {
      const s = await stat(binPath);
      checks.push({ name: 'binary-exists', passed: true });

      // Check executable permission
      const isExecutable = (s.mode & 0o111) !== 0;
      if (isExecutable) {
        checks.push({ name: 'binary-executable', passed: true });
      } else {
        checks.push({
          name: 'binary-executable',
          passed: false,
          issue: `binary at ${binPath} is not executable`,
        });
      }
    } catch {
      checks.push({
        name: 'binary-exists',
        passed: false,
        issue: `binary not found at ${binPath}`,
      });
    }

    // d. Help flag works
    if (checks.find((c) => c.name === 'binary-exists')?.passed) {
      try {
        const result = await execa('node', [binPath, '--help'], {
          cwd: projectDir,
          reject: false,
          timeout: 60_000,
        });
        if (result.exitCode === 0) {
          checks.push({ name: 'help-flag', passed: true });
        } else {
          checks.push({
            name: 'help-flag',
            passed: false,
            issue: `--help returned exit code ${result.exitCode}`,
          });
        }
      } catch (err: unknown) {
        checks.push({
          name: 'help-flag',
          passed: false,
          issue: `--help error: ${err instanceof Error ? err.message : String(err)}`.substring(0, 200),
        });
      }
    }
  }

  // e. Test suite
  const { testsRan, testsPassed } = await runTests(projectDir, pkg);

  // f. Lint passes
  if (pkg?.scripts?.lint) {
    try {
      const result = await execa('npm', ['run', 'lint'], {
        cwd: projectDir,
        reject: false,
        timeout: 60_000,
      });
      if (result.exitCode === 0) {
        checks.push({ name: 'lint', passed: true });
      } else {
        checks.push({
          name: 'lint',
          passed: false,
          issue: `lint failed with exit code ${result.exitCode}`,
        });
      }
    } catch (err: unknown) {
      checks.push({
        name: 'lint',
        passed: false,
        issue: `lint error: ${err instanceof Error ? err.message : String(err)}`.substring(0, 200),
      });
    }
  }

  return buildResult('cli', checks, testsRan, testsPassed);
}

// ── Shared helpers ─────────────────────────────────────────────────────

/**
 * Resolve the binary path from package.json bin field.
 * Returns null if no bin field or bin is empty.
 */
function resolveBinPath(
  pkg: PackageJson | null,
  projectDir: string,
): string | null {
  if (!pkg?.bin) return null;

  if (typeof pkg.bin === 'string') {
    return path.join(projectDir, pkg.bin);
  }

  const binEntries = Object.values(pkg.bin);
  if (binEntries.length === 0) return null;
  return path.join(projectDir, binEntries[0]!);
}

/**
 * Run test suite if package.json has a test script.
 * Returns { testsRan, testsPassed }.
 */
async function runTests(
  projectDir: string,
  pkg: PackageJson | null,
): Promise<{ testsRan: boolean; testsPassed: boolean | null }> {
  if (!pkg?.scripts?.test) {
    return { testsRan: false, testsPassed: null };
  }

  try {
    const result = await execa('npm', ['test'], {
      cwd: projectDir,
      reject: false,
      timeout: 60_000,
    });
    return {
      testsRan: true,
      testsPassed: result.exitCode === 0,
    };
  } catch {
    return { testsRan: true, testsPassed: false };
  }
}

/**
 * Build a VerifyResult from an array of check results.
 */
function buildResult(
  strategy: 'file-content' | 'cli',
  checks: CheckResult[],
  testsRan: boolean,
  testsPassed: boolean | null,
): VerifyResult {
  const passedChecks = checks.filter((c) => c.passed).length;
  const failedChecks = checks.filter((c) => !c.passed).length;
  const issues = checks
    .filter((c) => c.issue)
    .map((c) => c.issue!);

  return {
    strategy,
    passed: failedChecks === 0 && (testsPassed === null || testsPassed === true),
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    issues,
    testsRan,
    testsPassed,
  };
}

export { runFileContentVerification, runCliVerification };
