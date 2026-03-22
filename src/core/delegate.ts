/**
 * Delegation AI — spawns a short opencode session to read project state
 * and output a JSON intent (DelegationResult).
 *
 * Core v2 innovation: Instead of parsing .planning/ files with regex
 * (which constantly broke in v1), we spawn a cheap AI session that reads
 * project state and decides what intent to run.
 *
 * Intent-based (since Phase 66): The AI outputs a single typed intent object,
 * making the runner's workflow logic explicit and type-safe.
 *
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import { accessSync, constants, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findSessionByTitle, exportSessionFromDb, isSessionDone } from './opencode-db.js';
import { resolveTopLevelModel } from './models.js';
import { resolveSkillsForJob } from './skills.js';
import { getJobSteps } from './db.js';
import { errMsg } from '../util/errors.js';
import type { Job, DelegationIntent, DelegationResult, JobStep, StepSource } from './types.js';

// Load delegation prompt from src/prompts/delegate.md at module load time
const DELEGATE_PROMPT_PATH = fileURLToPath(new URL('../prompts/delegate.md', import.meta.url));
const DELEGATE_PROMPT = readFileSync(DELEGATE_PROMPT_PATH, 'utf8');

/**
 * Extract a human-readable title from a requirement file's `# Title` heading.
 * Returns the title text (trimmed), or null if no heading found or file unreadable.
 *
 * Used to pass clean titles to add-phase instead of file paths, preventing
 * ugly slugified phase directory names like `requirements-tui-visual-polish-md`.
 */
function extractRequirementTitle(requirementPath: string): string | null {
  try {
    const content = readFileSync(requirementPath, 'utf8');
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      return match[1].trim();
    }
    return null;
  } catch (err) {
    process.stderr.write(`[delegate] extractRequirementTitle readFileSync failed: ${errMsg(err)}\n`);
    return null;
  }
}

/**
 * Get the state of a phase directory: plan count, summary count, and whether complete.
 * isComplete = planCount > 0 && planCount === summaryCount
 */
function getPhaseState(phasesDir: string, phaseDirName: string): { planCount: number; summaryCount: number; isComplete: boolean } {
  try {
    const phaseDir = path.join(phasesDir, phaseDirName);
    const entries = readdirSync(phaseDir);
    const planCount = entries.filter(f => f.endsWith('-PLAN.md')).length;
    const summaryCount = entries.filter(f => f.endsWith('-SUMMARY.md')).length;
    const isComplete = planCount > 0 && planCount === summaryCount;
    return { planCount, summaryCount, isComplete };
  } catch (err) {
    process.stderr.write(`[delegate] getPhaseState readdirSync failed for ${phaseDirName}: ${errMsg(err)}\n`);
    return { planCount: 0, summaryCount: 0, isComplete: false };
  }
}

/**
 * Spawn a delegation AI session to determine what intent to execute for a job.
 * Uses a short cheap AI session that reads .planning/ and outputs a JSON intent.
 *
 * Fails fast on parse error, retrying once with error injection before failing.
 * The runner's job retry mechanism (attempts 1/3 → 2/3 → 3/3) handles higher-level retries.
 */
async function delegate(job: Job, projectDir: string): Promise<DelegationResult> {
  try {
    return await attemptDelegation(job, projectDir, 1);
  } catch (firstErr) {
    // If parse failure, retry once with error context injected into prompt
    const firstErrMsg = errMsg(firstErr);
    if (firstErrMsg.includes('Failed to parse') || firstErrMsg.includes('Invalid intent')) {
      try {
        return await attemptDelegation(job, projectDir, 2, `Your previous attempt produced invalid JSON: ${firstErrMsg}`);
      } catch (retryErr) {
        throw new Error(`${errMsg(retryErr)}. Check project setup with: pilot doctor --project ${projectDir}`);
      }
    }
    throw new Error(`${firstErrMsg}. Check project setup with: pilot doctor --project ${projectDir}`);
  }
}

// ── Re-Delegation (Step Continuation) ─────────────────────────────────────

/**
 * Result from re-querying the delegation AI after a failure or gaps_found verdict.
 * Contains new steps to append to the job's step list.
 */
interface ContinuationResult {
  steps: Array<{ command: string; args: string }>;
  reasoning: string;
  _sessionTitle?: string;  // for session attribution
}

/**
 * Re-query the delegation AI after a failure or gaps_found verdict.
 * Sends the step history and context, receives continuation steps to append.
 *
 * The delegation AI outputs { continuation_steps: [...], reasoning: ... }
 * which the runner will append as new pending steps.
 */
async function reDelegateForContinuation(
  job: Job,
  projectDir: string,
  context: {
    source: StepSource;
    reason: string;
    gaps?: string[];        // From judge verdict when gaps_found
    hungInfo?: {            // From hung session detection
      command: string;
      reason: string;
      toolName?: string;
    };
  },
): Promise<ContinuationResult> {
  try {
    return await attemptContinuationDelegation(job, projectDir, context, 1);
  } catch (firstErr) {
    // If parse failure, retry once with error context injected into prompt
    const firstErrMsg = errMsg(firstErr);
    if (firstErrMsg.includes('Failed to parse') || firstErrMsg.includes('No continuation_steps')) {
      try {
        return await attemptContinuationDelegation(job, projectDir, context, 2, `Your previous re-query attempt produced invalid JSON: ${firstErrMsg}`);
      } catch (retryErr) {
        throw new Error(`Re-delegation failed: ${errMsg(retryErr)}`);
      }
    }
    throw new Error(`Re-delegation failed: ${firstErrMsg}`);
  }
}

/**
 * Single re-delegation attempt: spawn opencode with inline prompt containing
 * step history and continuation context, wait for result, parse continuation_steps.
 */
async function attemptContinuationDelegation(
  job: Job,
  projectDir: string,
  context: {
    source: StepSource;
    reason: string;
    gaps?: string[];
    hungInfo?: {
      command: string;
      reason: string;
      toolName?: string;
    };
  },
  attempt: number,
  parseErrorHint?: string,
): Promise<ContinuationResult> {
  const ts = Date.now().toString(36).slice(-4);
  const title = `pilot-redelegate-${job.id}-${attempt}-${ts}`;

  // Get step history from DB
  const steps = getJobSteps(job.id);
  const stepHistory = steps.map(s => ({
    index: s.stepIndex,
    command: s.command,
    args: s.args,
    status: s.status,
    source: s.source,
    error: s.error ?? undefined,
    reason: s.reason ?? undefined,
  }));

  // Build continuation context section
  const continuationLines: string[] = [
    `source: ${context.source}`,
    `reason: ${context.reason}`,
  ];
  if (context.gaps && context.gaps.length > 0) {
    continuationLines.push(`gaps:`);
    for (const gap of context.gaps) {
      continuationLines.push(`  - ${gap}`);
    }
  }
  if (context.hungInfo) {
    continuationLines.push(`hung_command: ${context.hungInfo.command}`);
    continuationLines.push(`hung_reason: ${context.hungInfo.reason}`);
    if (context.hungInfo.toolName) {
      continuationLines.push(`hung_tool: ${context.hungInfo.toolName}`);
    }
  }

  // Build the full prompt with step history and continuation context
  const promptParts = [
    DELEGATE_PROMPT,
    '',
    '---',
    '',
    '## Current Job',
    '',
    `scope: ${job.scope}`,
    `project: ${job.project}`,
    `description: ${job.description}`,
    `requirement_path: ${job.requirementPath ?? 'none'}`,
    '',
    '<step_history>',
    JSON.stringify(stepHistory, null, 2),
    '</step_history>',
    '',
    '<continuation_context>',
    ...continuationLines,
    '</continuation_context>',
    '',
    'You are in RE-QUERY MODE. Output continuation_steps, not intent.',
    'Your response MUST be a JSON object with "continuation_steps" array and "reasoning" string.',
  ];

  if (parseErrorHint) {
    promptParts.push('');
    promptParts.push(`Parse Error from Previous Attempt:`);
    promptParts.push(parseErrorHint);
    promptParts.push(`Please produce valid JSON this time.`);
  }

  const fullPrompt = promptParts.join('\n');

  const opencodeBin = resolveOpencodeBinary();
  // Re-delegation is a phase-level operation
  const { model: topLevelModel, variant } = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);
  process.stderr.write(`[redelegate] Model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}\n`);

  const proc = execa(opencodeBin, [
    'run',
    '--format', 'default',
    '--model', topLevelModel,
    ...(variant ? ['--variant', variant] : []),
    '--title', title,
    fullPrompt,
  ], {
    cwd: projectDir,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: true,
    cleanup: false,
  });
  // Don't await — we poll the DB instead
  proc.catch(() => {});
  proc.unref();

  const spawnedPid = proc.pid;
  const result = await waitForContinuationResult(title, spawnedPid);
  return { ...result, _sessionTitle: title };
}

/**
 * Wait for a continuation delegation session to complete and parse its output.
 * Same polling pattern as waitForDelegationResult but parses continuation_steps.
 */
async function waitForContinuationResult(title: string, pid?: number): Promise<ContinuationResult> {
  const pollMs = 2_000;

  while (true) {
    await new Promise(r => setTimeout(r, pollMs));

    // Check if the spawned process is still alive
    if (pid !== undefined) {
      try {
        process.kill(pid, 0);
      } catch {
        // Process is dead — check if session completed before dying
        const sessionId = findSessionByTitle(title);
        if (sessionId && isSessionDone(sessionId)) {
          try {
            const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
            if (exported.messages.length > 0) {
              const lastAssistant = [...exported.messages].reverse().find(m => m.role === 'assistant');
              if (lastAssistant) {
                return parseContinuationOutput(String(lastAssistant.content ?? ''));
              }
            }
          } catch (err) {
            process.stderr.write(`[redelegate] session export failed for ${title}: ${errMsg(err)}\n`);
          }
        }
        throw new Error(`Re-delegation process died before completing session: ${title}`);
      }
    }

    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    // Wait for session to actually complete before extracting result
    if (!isSessionDone(sessionId)) continue;

    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        const lastAssistant = [...exported.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          const content = String(lastAssistant.content ?? '');
          return parseContinuationOutput(content);
        }
      }
    } catch (err) {
      process.stderr.write(`[redelegate] session export failed for ${title}: ${errMsg(err)}\n`);
    }
  }
}

/**
 * Parse continuation delegation AI output into a ContinuationResult.
 * Extracts JSON from a ```json block or uses raw content.
 * Validates that continuation_steps is an array of {command, args} objects.
 */
function parseContinuationOutput(content: string): ContinuationResult {
  // Extract JSON from ```json ... ``` block, or use raw content
  const jsonBlockMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : content.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse re-delegation output: ${errMsg(err)}\nRaw content: ${content.slice(0, 500)}`,
    );
  }

  const rawSteps = parsed.continuation_steps;
  if (!Array.isArray(rawSteps)) {
    throw new Error(
      `No continuation_steps array in re-delegation output. Got keys: ${Object.keys(parsed).join(', ')}`,
    );
  }

  const steps: Array<{ command: string; args: string }> = [];
  for (const step of rawSteps) {
    if (typeof step !== 'object' || step === null) {
      throw new Error('Each continuation step must be an object with command and args');
    }
    const s = step as Record<string, unknown>;
    if (typeof s.command !== 'string') {
      throw new Error('Each continuation step must have a string "command" field');
    }
    steps.push({
      command: s.command,
      args: typeof s.args === 'string' ? s.args : '',
    });
  }

  return {
    steps,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Scan .planning/phases/ directory for existing phase dirs and return next phase number.
 * Matches NN-* prefix pattern, same as GSD's gsd-tools.cjs.
 * Returns 1 if no phases dir or no matching dirs.
 */
function getNextPhaseNumber(phasesDir: string): number {
  try {
    const entries = readdirSync(phasesDir);
    let maxPhase = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)-/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxPhase) maxPhase = n;
      }
    }
    return maxPhase + 1;
  } catch (err) {
    process.stderr.write(`[delegate] getNextPhaseNumber readdirSync failed: ${errMsg(err)}\n`);
    return 1;
  }
}

/**
 * Build args for gsd-new-project.
 * IMPORTANT: opencode's yargs parser swallows args starting with --.
 * So we put the file reference FIRST, then the auto flag.
 * GSD checks for --auto presence anywhere in $ARGUMENTS.
 */
function buildNewProjectArgs(job: Job): string {
  if (job.requirementPath) {
    return `@${job.requirementPath} --auto`;
  }
  return `${job.description} --auto`;
}

/**
 * Build args for gsd-quick.
 */
function buildQuickArgs(job: Job): string {
  if (job.requirementPath) {
    return `Read ${job.requirementPath} for full details and implement all requirements. ${job.description}`;
  }
  return job.description;
}

/**
 * Single delegation attempt: spawn opencode with inline prompt, wait for result, parse output.
 *
 * The prompt is passed directly as the message — fully under Pilot's control.
 * No GSD command reference needed.
 *
 * @param parseErrorHint Optional error context from a previous failed parse attempt.
 */
async function attemptDelegation(
  job: Job,
  projectDir: string,
  attempt: number,
  parseErrorHint?: string,
): Promise<DelegationResult & { _sessionTitle: string }> {
  const ts = Date.now().toString(36).slice(-4);
  const title = `pilot-delegate-${job.id}-${attempt}-${ts}`;

  const argLines = [
    `scope: ${job.scope}`,
    `project: ${job.project}`,
    `description: ${job.description}`,
    `requirement_path: ${job.requirementPath ?? 'none'}`,
    `retry_context: ${job.resumeHint ?? 'none'}`,
    `attempt: ${job.attempts}`,
  ];

  // Append skills hint if job has categories and matched skills exist
  try {
    const matchedSkills = resolveSkillsForJob(job.categories ?? null);
    if (matchedSkills.length > 0) {
      const categoryList = job.categories?.join(', ') ?? 'none';
      const skillNames = matchedSkills.map(s => s.name).join(', ');
      argLines.push(`\nAvailable Skills:`);
      argLines.push(`skill_categories: ${categoryList}`);
      argLines.push(`matched_skills: ${skillNames}`);
      argLines.push(`Note: Read these skills when relevant to the current task.`);
    }
  } catch (err) {
    process.stderr.write(`[delegate] skills resolution failed: ${errMsg(err)}\n`);
  }

  // If this is a retry after parse failure, inject the error context
  if (parseErrorHint) {
    argLines.push(`\nParse Error from Previous Attempt:`);
    argLines.push(parseErrorHint);
    argLines.push(`Please produce valid JSON this time.`);
  }

  const args = argLines.join('\n');

  // Combine the delegation prompt with the current job context
  const fullPrompt = `${DELEGATE_PROMPT}\n\n---\n\n## Current Job\n\n${args}`;

  const opencodeBin = resolveOpencodeBinary();
  const { model: topLevelModel, variant } = resolveTopLevelModel('phase', job.modelProfile, job.providerMode);
  process.stderr.write(`[delegate] Model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}\n`);

  const proc = execa(opencodeBin, [
    'run',
    '--format', 'default',
    '--model', topLevelModel,
    ...(variant ? ['--variant', variant] : []),
    '--title', title,
    fullPrompt,
  ], {
    cwd: projectDir,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: true,
    cleanup: false,
  });
  // Don't await — we poll the DB instead
  proc.catch(() => {});
  proc.unref();

  const spawnedPid = proc.pid;
  const result = await waitForDelegationResult(title, spawnedPid);
  return { ...result, _sessionTitle: title };
}

/**
 * Resolve the opencode binary path.
 *
 * Candidates are checked in order:
 *   1. ~/.opencode/bin/opencode (standard install location)
 *   2. 'opencode' via PATH lookup
 *
 * For absolute/relative paths, uses accessSync(X_OK) to verify existence and
 * executability. For bare command names, uses `which` to check PATH resolution.
 *
 * Returns the first candidate that resolves. Falls back to bare 'opencode'
 * (will produce a clear ENOENT at spawn time if truly missing).
 */
function resolveOpencodeBinary(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  const candidates = [
    path.join(home, '.opencode', 'bin', 'opencode'),
    'opencode',
  ];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.startsWith('.')) {
      // Absolute or relative path — check filesystem
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch { continue; }
    } else {
      // Bare command name — check PATH via which
      try {
        const resolved = execSync(`which ${candidate}`, { encoding: 'utf8', timeout: 5_000 }).trim();
        if (resolved) return resolved;
      } catch { continue; }
    }
  }
  return 'opencode'; // fallback — will ENOENT with clear message
}

/**
 * Wait for a delegation session to complete and parse its output.
 * Polls opencode DB every 2 seconds — no wall-clock timeout.
 * Exits when isSessionDone() returns true, or throws immediately if the PID dies.
 * If pid is provided, checks process liveness each cycle — bails early on dead process.
 */
async function waitForDelegationResult(title: string, pid?: number): Promise<DelegationResult> {
  const pollMs = 2_000;

  while (true) {
    await new Promise(r => setTimeout(r, pollMs));

    // Check if the spawned process is still alive
    if (pid !== undefined) {
      try {
        process.kill(pid, 0);
      } catch {
        // Process is dead — check if session completed before dying
        const sessionId = findSessionByTitle(title);
        if (sessionId && isSessionDone(sessionId)) {
          // Session completed — extract result below
          try {
            const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
            if (exported.messages.length > 0) {
              const lastAssistant = [...exported.messages].reverse().find(m => m.role === 'assistant');
              if (lastAssistant) {
                return parseIntentOutput(String(lastAssistant.content ?? ''));
              }
            }
          } catch (err) {
            process.stderr.write(`[delegate] session export failed for ${title}: ${errMsg(err)}\n`);
          }
        }
        throw new Error(`Delegation process died before completing session: ${title}`);
      }
    }

    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    // Wait for session to actually complete before extracting result
    if (!isSessionDone(sessionId)) continue;

    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        const lastAssistant = [...exported.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          const content = String(lastAssistant.content ?? '');
          return parseIntentOutput(content);
        }
      }
    } catch (err) {
      process.stderr.write(`[delegate] session export failed for ${title}: ${errMsg(err)}\n`);
    }
  }
}

/**
 * Parse delegation AI output into a DelegationResult.
 * Extracts JSON from a ```json block or uses raw content.
 * Validates that intent.type is one of the known DelegationIntent types.
 */
function parseIntentOutput(content: string): DelegationResult {
  // Extract JSON from ```json ... ``` block, or use raw content
  const jsonBlockMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : content.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse delegation output: ${errMsg(err)}\nRaw content: ${content.slice(0, 500)}`,
    );
  }

  const validTypes = ['quick', 'debug', 'fast', 'init-project', 'new-milestone', 'plan-and-execute', 'execute-only', 'audit-milestone', 'noop'];
  const intent = parsed.intent as Record<string, unknown> | undefined;

  if (!intent || typeof intent.type !== 'string' || !validTypes.includes(intent.type)) {
    throw new Error(`Invalid intent type: ${intent?.type ?? 'undefined'}. Valid types: ${validTypes.join(', ')}`);
  }

  // Type-specific field validation
  switch (intent.type) {
    case 'quick':
      if (typeof intent.description !== 'string') {
        throw new Error('Intent "quick" must have a string "description" field');
      }
      break;
    case 'debug':
      if (typeof intent.description !== 'string') {
        throw new Error('Intent "debug" must have a string "description" field');
      }
      break;
    case 'fast':
      if (typeof intent.description !== 'string') {
        throw new Error('Intent "fast" must have a string "description" field');
      }
      break;
    case 'init-project':
      if (typeof intent.prdPath !== 'string') {
        throw new Error('Intent "init-project" must have a string "prdPath" field');
      }
      break;
    case 'new-milestone':
      if (typeof intent.prdPath !== 'string') {
        throw new Error('Intent "new-milestone" must have a string "prdPath" field');
      }
      break;
    case 'plan-and-execute':
      if (typeof intent.phaseNumber !== 'number') {
        throw new Error('Intent "plan-and-execute" must have a numeric "phaseNumber" field');
      }
      // Normalize uiPhase to boolean (optional field — omission means false)
      if (intent.uiPhase !== undefined && typeof intent.uiPhase !== 'boolean') {
        (intent as Record<string, unknown>).uiPhase = Boolean(intent.uiPhase);
      }
      break;
    case 'execute-only':
      if (typeof intent.phaseNumber !== 'number') {
        throw new Error('Intent "execute-only" must have a numeric "phaseNumber" field');
      }
      break;
    case 'audit-milestone':
      if (typeof intent.version !== 'string') {
        throw new Error('Intent "audit-milestone" must have a string "version" field');
      }
      break;
    case 'noop':
      if (typeof intent.reason !== 'string') {
        throw new Error('Intent "noop" must have a string "reason" field');
      }
      break;
  }

  return {
    intent: intent as DelegationIntent,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

export {
  delegate,
  reDelegateForContinuation,
  parseIntentOutput,
  parseContinuationOutput,
  resolveOpencodeBinary,
  buildNewProjectArgs,
  buildQuickArgs,
  getNextPhaseNumber,
  extractRequirementTitle,
  getPhaseState,
};
