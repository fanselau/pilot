/**
 * Lifecycle mode implementations — project automation patterns.
 *
 * Port of bash lifecycle_* functions from gsd-queue-v5.sh.
 * Routes queue entries to the correct automation flow:
 *
 *   build-full     → reject if .planning/ exists, then new-project + full cycle
 *   continue       → run one incomplete phase cycle
 *   continue-all   → loop until all phases done
 *   build-to-phase → run through phase N
 *   add-and-build  → add phase to roadmap + run cycle
 *   run-command    → raw passthrough
 *
 * Phase cycle: plan → execute → verify → gap closure (max 3 cycles).
 *
 * Pure core module — no UI dependencies.
 */

import path from 'node:path';
import { readFile, rename, access, readdir } from 'node:fs/promises';
import { execa } from 'execa';

import { getConfig } from './config.js';
import { getPhaseState, writePhaseState, getLastPhase, findPhaseDir, countSummaryFiles, countNonGapPlanFiles } from './phase-state.js';
import { truncateTitle, getResolvedBinary } from './spawn.js';
import { detectProjectType, detectVerifyNotApplicable } from './verify-routing.js';
import { runFileContentVerification, runCliVerification } from './verify-strategies.js';
import { writeFile } from 'node:fs/promises';
import type { PilotConfig } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum gap-closure cycles before giving up. */
const MAX_GAP_CYCLES = 3;

/** Maximum verify attempts before auto-skipping verify. */
const MAX_VERIFY_ATTEMPTS = 3;

// ── runLifecycleMode ──────────────────────────────────────────────────────

/**
 * Main dispatch: route a queue entry's mode to its lifecycle handler.
 *
 * @param projectDir - Absolute path to the project directory
 * @param mode       - Lifecycle mode (build-full, continue, etc.)
 * @param args       - Mode-specific arguments (description, phase number, etc.)
 */
async function runLifecycleMode(
  projectDir: string,
  mode: string,
  args: string,
): Promise<void> {
  switch (mode) {
    case 'build-full':
      await lifecycleBuildFull(projectDir, args);
      break;

    case 'continue':
      await lifecycleContinue(projectDir);
      break;

    case 'continue-all':
      await lifecycleContinueAll(projectDir);
      break;

    case 'build-to-phase':
      await lifecycleBuildToPhase(projectDir, args);
      break;

    case 'add-and-build':
      await lifecycleAddAndBuild(projectDir, args);
      break;

    case 'run-command':
      await lifecycleRunCommand(projectDir, args);
      break;

    default:
      throw new Error(`Unknown lifecycle mode: ${mode}`);
  }
}

// ── build-full ────────────────────────────────────────────────────────────

/**
 * Build a project from scratch.
 *
 * HARD REQUIREMENT (AUTO-19): MUST FAIL if .planning/ already exists.
 * This prevents the phantom completion bug where it "completes" existing
 * phases without building new requirements.
 *
 * Flow:
 *   1. Reject if .planning/ exists
 *   2. Spawn gsd-new-project with description
 *   3. Loop: findNextPhase → runPhaseCycle → repeat until all done
 */
async function lifecycleBuildFull(projectDir: string, description: string): Promise<void> {
  // HARD REQUIREMENT: reject if .planning/ already exists
  const planningDir = path.join(projectDir, '.planning');
  if (await pathExists(planningDir)) {
    const project = path.basename(projectDir);
    throw new Error(
      `.planning/ already exists in ${project}. ` +
      `Use 'continue-all' for existing projects or delete .planning/ to start fresh.`,
    );
  }

  // Spawn gsd-new-project with description
  const exitCode = await spawnAndWait(
    projectDir,
    'new-project',
    description ? `--auto ${description}` : '--auto',
  );

  if (exitCode !== 0) {
    throw new Error(`gsd-new-project failed with exit code ${exitCode}`);
  }

  // Loop through all phases
  let phase = await findNextPhase(projectDir);
  while (phase !== null) {
    await runPhaseCycle(projectDir, phase);
    phase = await findNextPhase(projectDir);
  }
}

// ── continue ──────────────────────────────────────────────────────────────

/**
 * Run ONE incomplete phase cycle (plan → execute → verify with gap closure).
 */
async function lifecycleContinue(projectDir: string): Promise<void> {
  const phase = await findNextPhase(projectDir);
  if (phase === null) {
    // All phases done
    return;
  }
  await runPhaseCycle(projectDir, phase);
}

// ── continue-all ──────────────────────────────────────────────────────────

/**
 * Loop `continue` until all phases are done.
 */
async function lifecycleContinueAll(projectDir: string): Promise<void> {
  let phase = await findNextPhase(projectDir);
  while (phase !== null) {
    await runPhaseCycle(projectDir, phase);
    phase = await findNextPhase(projectDir);
  }
}

// ── build-to-phase ────────────────────────────────────────────────────────

/**
 * Run through phases 1..N. For each: if state ≠ "done", runPhaseCycle.
 * Stop after phase N is done.
 */
async function lifecycleBuildToPhase(projectDir: string, args: string): Promise<void> {
  const targetPhase = parseInt(args.trim(), 10);
  if (Number.isNaN(targetPhase) || targetPhase <= 0) {
    throw new Error(`Invalid target phase: ${args}. Expected a positive integer.`);
  }

  for (let phase = 1; phase <= targetPhase; phase++) {
    const state = await getPhaseState(projectDir, phase);
    if (state !== 'done') {
      await runPhaseCycle(projectDir, phase);
    }
  }
}

// ── add-and-build ─────────────────────────────────────────────────────────

/**
 * Add a new phase to the roadmap and build it.
 *
 * 1. Check if description's first keyword already exists in ROADMAP.md (skip)
 * 2. Spawn gsd-add-phase with description
 * 3. Detect newly created phase number
 * 4. Run phase cycle on the new phase
 */
async function lifecycleAddAndBuild(projectDir: string, description: string): Promise<void> {
  // Skip check: first keyword already in ROADMAP.md
  const shouldSkip = await shouldSkipAddPhase(projectDir, description);
  if (!shouldSkip) {
    const exitCode = await spawnAndWait(projectDir, 'add-phase', description);
    if (exitCode !== 0) {
      throw new Error(`gsd-add-phase failed with exit code ${exitCode}`);
    }
  }

  // Detect newly created phase number
  const newPhase = await getLastPhase(projectDir);
  if (newPhase === 0) {
    throw new Error('No phases found after gsd-add-phase');
  }

  await runPhaseCycle(projectDir, newPhase);
}

/**
 * Check if the first keyword of the description already exists in ROADMAP.md.
 * Matches the bash skip check for add-and-build mode.
 */
async function shouldSkipAddPhase(projectDir: string, description: string): Promise<boolean> {
  const firstKeyword = description.split(/\s+/)[0]?.toLowerCase();
  if (!firstKeyword) {
    return false;
  }

  const roadmapPath = path.join(projectDir, '.planning', 'ROADMAP.md');
  try {
    const content = await readFile(roadmapPath, 'utf8');
    return content.toLowerCase().includes(firstKeyword);
  } catch {
    return false;
  }
}

// ── run-command ───────────────────────────────────────────────────────────

/**
 * Raw passthrough mode. Strip gsd- prefix if present.
 */
async function lifecycleRunCommand(projectDir: string, args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  let command = parts[0] ?? '';
  const commandArgs = parts.slice(1).join(' ');

  // Strip gsd- prefix if present
  if (command.startsWith('gsd-')) {
    command = command.slice(4);
  }

  if (command.length === 0) {
    throw new Error('run-command requires a command argument');
  }

  const exitCode = await spawnAndWait(projectDir, command, commandArgs);
  if (exitCode !== 0) {
    throw new Error(`gsd-${command} failed with exit code ${exitCode}`);
  }
}

// ── findNextPhase ─────────────────────────────────────────────────────────

/**
 * Find the first incomplete phase in the project.
 *
 * Reads ROADMAP.md to extract phase numbers, then checks each phase's
 * state. Returns the first phase where state !== 'done', or null if
 * all phases are complete.
 */
async function findNextPhase(projectDir: string): Promise<number | null> {
  const phases = await getPhaseNumbers(projectDir);
  if (phases.length === 0) {
    return null;
  }

  for (const phase of phases) {
    const state = await getPhaseState(projectDir, phase);
    if (state !== 'done') {
      return phase;
    }
  }

  return null;
}

/**
 * Extract phase numbers from the project's phases directory.
 * Returns sorted array of phase numbers.
 */
async function getPhaseNumbers(projectDir: string): Promise<number[]> {
  const phasesDir = path.join(projectDir, '.planning', 'phases');

  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch {
    return [];
  }

  const phases: number[] = [];
  for (const name of entries) {
    const match = /^(\d+)-/.exec(name);
    if (match !== null) {
      phases.push(parseInt(match[1]!, 10));
    }
  }

  return phases.sort((a, b) => a - b);
}

// ── runPhaseCycle ─────────────────────────────────────────────────────────

/**
 * Run the full plan→execute→verify→gap-closure cycle for a phase.
 *
 * Port of bash run_phase_cycle. Loops until phase is done or gap
 * closure exceeds MAX_GAP_CYCLES.
 *
 * State transitions:
 *   needs-plan    → plan → needs-execute
 *   needs-execute → execute → needs-verify
 *   needs-verify  → verify → done | needs-gaps
 *   needs-gaps    → gap closure (max 3 cycles)
 *   done          → return
 */
async function runPhaseCycle(projectDir: string, phase: number): Promise<void> {
  let gapCycles = 0;
  let verifyAttempts = 0;

  while (true) {
    const state = await getPhaseState(projectDir, phase);

    switch (state) {
      case 'done':
        return;

      case 'needs-plan': {
        await writePhaseState(projectDir, phase, 'planning');
        const exitCode = await spawnAndWait(
          projectDir,
          'plan-phase',
          `${phase} --auto`,
        );
        if (exitCode !== 0) {
          throw new Error(`gsd-plan-phase ${phase} failed with exit code ${exitCode}`);
        }
        await writePhaseState(projectDir, phase, 'planned');
        break;
      }

      case 'needs-execute': {
        await writePhaseState(projectDir, phase, 'executing');
        const exitCode = await spawnAndWait(
          projectDir,
          'execute-phase',
          `${phase} --auto`,
        );
        if (exitCode !== 0) {
          throw new Error(`gsd-execute-phase ${phase} failed with exit code ${exitCode}`);
        }
        await writePhaseState(projectDir, phase, 'executed');
        break;
      }

      case 'needs-verify': {
        await writePhaseState(projectDir, phase, 'verifying');

        // Smart verify routing: detect project type before spawning
        const projectType = await detectProjectType(projectDir);
        process.stderr.write(
          `[lifecycle] Phase ${phase}: verify strategy=${projectType}\n`,
        );

        if (projectType === 'file-content' || projectType === 'cli') {
          // Non-web: run verification directly (no AI agent spawn)
          const verifyResult =
            projectType === 'cli'
              ? await runCliVerification(projectDir, phase)
              : await runFileContentVerification(projectDir, phase);

          if (verifyResult.passed) {
            await writePhaseState(projectDir, phase, 'verified');
            process.stderr.write(
              `[lifecycle] Phase ${phase}: ${projectType} verification passed ` +
              `(${verifyResult.passedChecks}/${verifyResult.totalChecks} checks)\n`,
            );
          } else {
            verifyAttempts++;
            process.stderr.write(
              `[lifecycle] Phase ${phase}: ${projectType} verification found issues (attempt ${verifyAttempts}/${MAX_VERIFY_ATTEMPTS}): ` +
              `${verifyResult.issues.join(', ')}\n`,
            );

            if (verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
              // Auto-skip verify after max attempts
              process.stderr.write(
                `[lifecycle] Phase ${phase}: verify failed ${verifyAttempts}x. Auto-skipping, marking as verified-manually.\n`,
              );
              await writePhaseState(projectDir, phase, 'verified');
              const skipPhaseDir = await findPhaseDir(projectDir, phase);
              if (skipPhaseDir !== null) {
                const padded = String(phase).padStart(2, '0');
                const uatContent = [
                  '# Verification Results (auto-skipped)',
                  '',
                  'result: pass',
                  'failed: 0',
                  '',
                  `Verification auto-skipped after ${verifyAttempts} attempts.`,
                  'Reason: Max verify attempts reached.',
                  'Strategy used: verified-manually',
                ].join('\n');
                await writeFile(
                  path.join(skipPhaseDir, `${padded}-UAT.md`),
                  uatContent,
                  'utf8',
                );
              }
              break;
            }

            await writePhaseState(projectDir, phase, 'needs-gaps');

            // Write UAT-style file for gap closure compatibility
            const phaseDir = await findPhaseDir(projectDir, phase);
            if (phaseDir !== null) {
              const padded = String(phase).padStart(2, '0');
              const uatContent =
                `# Verification Results (${projectType} strategy)\n` +
                `result: ${verifyResult.passed ? 'pass' : 'fail'}\n` +
                `failed: ${verifyResult.failedChecks}\n` +
                `## Issues\n` +
                verifyResult.issues.map((i) => `- ${i}`).join('\n') +
                '\n';
              await writeFile(
                path.join(phaseDir, `${padded}-UAT.md`),
                uatContent,
                'utf8',
              );
            }
          }
        } else {
          // Web project: existing gsd-verify-auto spawn (unchanged)
          const exitCode = await spawnAndWait(
            projectDir,
            'verify-auto',
            String(phase),
          );
          // Verification may fail and set state to needs-gaps
          // Check state after verify to determine next step
          if (exitCode !== 0) {
            verifyAttempts++;

            if (verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
              // Check log content for not-applicable patterns
              const config = getConfig();
              const title = truncateTitle(
                path.basename(projectDir),
                'verify-auto',
                String(phase),
              );
              const logFile = path.join(config.logDir, `gsd-${title}.log`);
              let logContent = '';
              try {
                logContent = await readFile(logFile, 'utf8');
              } catch {
                /* no log */
              }

              const notApplicable = detectVerifyNotApplicable(logContent);
              process.stderr.write(
                `[lifecycle] Phase ${phase}: verify failed ${verifyAttempts}x` +
                (notApplicable ? ' (not applicable detected)' : '') +
                `. Auto-skipping, marking as verified-manually.\n`,
              );
              await writePhaseState(projectDir, phase, 'verified');
              // Write UAT
              const skipPhaseDir = await findPhaseDir(projectDir, phase);
              if (skipPhaseDir !== null) {
                const padded = String(phase).padStart(2, '0');
                await writeFile(
                  path.join(skipPhaseDir, `${padded}-UAT.md`),
                  [
                    '# Verification Results (auto-skipped)',
                    '',
                    'result: pass',
                    'failed: 0',
                    '',
                    `Verification auto-skipped after ${verifyAttempts} attempts.`,
                    notApplicable
                      ? 'Reason: Browser verification not applicable for this project type.'
                      : 'Reason: Max verify attempts reached.',
                    'Strategy used: verified-manually',
                  ].join('\n'),
                  'utf8',
                );
              }
              break;
            }

            // Non-zero exit from verify — check if UAT created with failures
            const newState = await getPhaseState(projectDir, phase);
            if (newState === 'needs-gaps') {
              await writePhaseState(projectDir, phase, 'needs-gaps');
            } else if (newState !== 'done') {
              throw new Error(
                `gsd-verify-auto ${phase} failed with exit code ${exitCode}`,
              );
            }
          }
        }
        break;
      }

      case 'needs-gaps': {
        // Guard: check if original plans have been executed (SUMMARY files exist)
        const phaseDir = await findPhaseDir(projectDir, phase);
        if (phaseDir !== null) {
          const originalPlanCount = await countNonGapPlanFiles(phaseDir);
          const summaryCount = await countSummaryFiles(phaseDir);
          if (summaryCount < originalPlanCount) {
            process.stderr.write(
              `[lifecycle] Phase ${phase}: needs gap closure but only ${summaryCount}/${originalPlanCount} ` +
              `original plans have summaries. Skipping gap closure — running full execute.\n`,
            );
            await writePhaseState(projectDir, phase, 'executing');
            const fullExecExit = await spawnAndWait(
              projectDir,
              'execute-phase',
              `${phase} --auto`,
            );
            if (fullExecExit !== 0) {
              throw new Error(
                `gsd-execute-phase ${phase} --auto (gap fallback) failed with exit code ${fullExecExit}`,
              );
            }
            await writePhaseState(projectDir, phase, 'executed');
            break; // Continue loop — next iteration re-verifies
          }
        }

        if (gapCycles >= MAX_GAP_CYCLES) {
          // Max gap cycles reached — FAIL instead of silently accepting
          process.stderr.write(
            `[lifecycle] Phase ${phase}: max gap closure cycles (${MAX_GAP_CYCLES}) reached. ` +
            `Gaps remain — failing.\n`,
          );
          throw new Error(
            `Phase ${phase}: gap closure failed after ${MAX_GAP_CYCLES} cycles — gaps remain`,
          );
        }

        gapCycles++;

        // Step 1: Rename existing UAT to *.prev.md (stale UAT fix)
        await renameStaleUat(projectDir, phase);

        // Step 2: Plan gaps
        const planExit = await spawnAndWait(
          projectDir,
          'plan-phase',
          `${phase} --gaps`,
        );
        if (planExit !== 0) {
          throw new Error(`gsd-plan-phase ${phase} --gaps failed with exit code ${planExit}`);
        }

        // Step 3: Execute gaps only
        const execExit = await spawnAndWait(
          projectDir,
          'execute-phase',
          `${phase} --gaps-only --auto`,
        );
        if (execExit !== 0) {
          throw new Error(`gsd-execute-phase ${phase} --gaps-only failed with exit code ${execExit}`);
        }

        // Step 4: Re-verify
        const verifyExit = await spawnAndWait(
          projectDir,
          'verify-auto',
          String(phase),
        );
        // After re-verify, the next iteration will check state
        if (verifyExit !== 0) {
          const newState = await getPhaseState(projectDir, phase);
          if (newState !== 'needs-gaps' && newState !== 'done') {
            throw new Error(`gsd-verify-auto ${phase} (gap closure) failed with exit code ${verifyExit}`);
          }
        }
        break;
      }
    }
  }
}

// ── Rename stale UAT ──────────────────────────────────────────────────────

/**
 * Rename existing *-UAT.md to *-UAT.prev.md before gap closure.
 * This prevents stale UAT results from confusing state detection.
 */
async function renameStaleUat(projectDir: string, phase: number): Promise<void> {
  const padded = String(phase).padStart(2, '0');
  const phasesDir = path.join(projectDir, '.planning', 'phases');

  let entries: string[];
  try {
    entries = await readdir(phasesDir);
  } catch {
    return;
  }

  // Find phase directory
  const phaseDir = entries.find((name) => name.startsWith(padded + '-'));
  if (phaseDir === undefined) {
    return;
  }

  const phaseDirPath = path.join(phasesDir, phaseDir);
  let phaseFiles: string[];
  try {
    phaseFiles = await readdir(phaseDirPath);
  } catch {
    return;
  }

  // Find and rename UAT files (not already .prev.md)
  for (const file of phaseFiles) {
    if (file.endsWith('-UAT.md') && !file.endsWith('.prev.md')) {
      const oldPath = path.join(phaseDirPath, file);
      const newPath = path.join(phaseDirPath, file.replace('-UAT.md', '-UAT.prev.md'));
      try {
        await rename(oldPath, newPath);
      } catch {
        // Best effort
      }
    }
  }
}

// ── spawnAndWait ──────────────────────────────────────────────────────────

/**
 * Spawn an AI session and wait for it to complete.
 *
 * Unlike the runner's top-level detached spawning (fire and forget),
 * lifecycle mode spawning within a phase cycle is SYNCHRONOUS — we
 * wait for each step to complete before moving to the next.
 *
 * Uses execa with await (not detached) so we can capture exit code.
 */
async function spawnAndWait(
  projectDir: string,
  command: string,
  args: string,
): Promise<number> {
  const config = getConfig();
  const project = path.basename(projectDir);
  const title = truncateTitle(project, command, args || undefined);
  const logFile = path.join(config.logDir, `gsd-${title}.log`);

  const binary = getResolvedBinary();
  if (binary === null) {
    throw new Error(
      'Binary not resolved. Call preSpawnChecks() before lifecycle mode execution.',
    );
  }

  const execaArgs = [
    'run',
    '--format', 'default',
    '--title', title,
    '--command', `gsd-${command}`,
    ...(args ? [args] : []),
  ];

  // NOT detached — we wait for completion (synchronous lifecycle spawning)
  const result = await execa(binary, execaArgs, {
    cwd: projectDir,
    stdin: 'ignore',
    stdout: { file: logFile },
    stderr: { file: logFile },
    reject: false, // Don't throw on non-zero exit
  });

  return result.exitCode ?? 1;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Check if a path exists (file or directory).
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export { runLifecycleMode, runPhaseCycle, findNextPhase };
