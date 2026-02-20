/**
 * pilot verify <project> <phase> — Automated UAT with smart routing.
 *
 * Routes verification based on project type:
 *   - web → spawn gsd-verify-auto (browser UAT, unchanged)
 *   - file-content → run file checks (no AI agent)
 *   - cli → build + binary + test checks (no AI agent)
 *
 * Strategy selection:
 *   --strategy auto    → detect project type (default)
 *   --strategy browser → force browser UAT
 *   --strategy file    → force file-content checks
 *   --strategy cli     → force CLI checks
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';
import { resolveVerifyStrategy } from '../core/verify-routing.js';
import { runFileContentVerification, runCliVerification } from '../core/verify-strategies.js';
import type { VerifyStrategy, VerifyResult } from '../core/types.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

function sanitizeArgs(args: string): string {
  return args
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format VerifyResult as human-readable output for non-web strategies.
 */
function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];
  lines.push(`Verification: ${result.strategy} strategy`);
  lines.push('────────────────────────────────────────────');

  // Show test results if tests were run
  if (result.testsRan) {
    if (result.testsPassed) {
      lines.push('✓ Tests passed');
    } else {
      lines.push('✗ Tests failed');
    }
  }

  // Show overall result
  lines.push('');
  if (result.passed) {
    lines.push(
      `Result: PASS (${result.passedChecks}/${result.totalChecks} checks passed)`,
    );
  } else {
    lines.push(
      `Result: FAIL (${result.passedChecks}/${result.totalChecks} checks passed, ${result.failedChecks} issue${result.failedChecks !== 1 ? 's' : ''})`,
    );
  }

  // Show issues
  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  return lines.join('\n');
}

export async function verifyCommand(
  project: string,
  phase: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();
  const dir = path.join(config.projectDir, project);

  try {
    await access(dir);
  } catch {
    process.stderr.write(`Error: Project directory not found: ${dir}\n`);
    process.exit(1);
  }

  // Resolve strategy
  const strategyFlag = (opts['strategy'] as VerifyStrategy) ?? 'auto';
  const { strategy: resolvedStrategy, reason } = await resolveVerifyStrategy(
    strategyFlag,
    dir,
  );

  process.stderr.write(
    `[verify] Strategy: ${resolvedStrategy} (${reason})\n`,
  );

  // Route based on resolved strategy
  if (resolvedStrategy === 'web') {
    // Existing behavior: spawn gsd-verify-auto
    const gsdCommand = 'gsd-verify-auto';
    let args = phase;
    if (opts['port']) args += ` --port ${String(opts['port'])}`;

    const title = truncateTitle(
      `${project}-${gsdCommand}-${sanitizeArgs(args)}`,
    );

    const execArgs = args.includes('--')
      ? [
          'run',
          '--format',
          'default',
          '--title',
          title,
          '--command',
          gsdCommand,
          '--',
          args,
        ]
      : [
          'run',
          '--format',
          'default',
          '--title',
          title,
          '--command',
          gsdCommand,
          args,
        ];

    const result = await execa('opencode', execArgs, {
      cwd: dir,
      stdio: 'inherit',
      reject: false,
    });

    process.exit(result.exitCode ?? 0);
  } else {
    // Non-web strategy: run verification directly
    const phaseNum = parseInt(phase, 10);
    if (Number.isNaN(phaseNum) || phaseNum <= 0) {
      process.stderr.write(
        `Error: Invalid phase number: ${phase}\n`,
      );
      process.exit(2);
    }

    const result: VerifyResult =
      resolvedStrategy === 'cli'
        ? await runCliVerification(dir, phaseNum)
        : await runFileContentVerification(dir, phaseNum);

    process.stderr.write(formatVerifyResult(result) + '\n');

    if (result.passed) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}
