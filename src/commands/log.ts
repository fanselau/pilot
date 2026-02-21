/**
 * pilot log <session> — Session transcript display.
 *
 * Finds a session via fuzzy matching, exports its data, and formats
 * the transcript with role-based styling (user/assistant/tool-use).
 *
 * Special case: `pilot log runner` displays the runner log file.
 */

import { readFile } from 'node:fs/promises';
import { findSession, exportSession } from '../core/sessions.js';
import { getLatestRunnerLogPath } from '../core/runner-log.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { bold, cyan, green, dim } from '../util/colors.js';

interface LogOpts {
  json?: boolean;
  verbose?: boolean;
}

async function logCommand(session: string, opts: LogOpts): Promise<void> {
  void opts; // used via isJsonMode()

  // ── Special case: "runner" displays the runner log file ──────────────
  if (session.toLowerCase() === 'runner') {
    const logPath = getLatestRunnerLogPath();
    if (logPath === null) {
      process.stderr.write('Error: No runner log found. Run `pilot run` first.\n');
      process.exit(1);
    }

    let content: string;
    try {
      content = await readFile(logPath, 'utf8');
    } catch {
      process.stderr.write(`Error: Could not read runner log: ${logPath}\n`);
      process.exit(1);
    }

    if (isJsonMode()) {
      outputJson({
        log_path: logPath,
        content,
      });
      return;
    }

    const sep = '─'.repeat(56);
    outputHuman(`Runner Log — ${bold(logPath)}`);
    outputHuman(sep);
    outputHuman('');
    outputHuman(content);
    return;
  }

  // 1. Find session via fuzzy match
  const found = await findSession(session);
  if (!found) {
    process.stderr.write(`Error: Session not found: ${session}\n`);
    process.exit(1);
  }

  // 2. Export session data
  let exported: unknown;
  try {
    exported = await exportSession(found.id);
  } catch {
    process.stderr.write(`Failed to export session: ${found.id}\n`);
    process.exit(1);
  }

  // 3. JSON mode — output raw data with timestamp
  if (isJsonMode()) {
    outputJson({
      session: found,
      export: exported,
    });
    return;
  }

  // 4. Human mode — formatted transcript
  const sep = '─'.repeat(56);
  outputHuman(`${found.title} — ${bold('Session Log')}`);
  outputHuman(sep);
  outputHuman('');

  const messages = extractMessages(exported);
  if (messages.length === 0) {
    outputHuman(dim('(no messages found)'));
    return;
  }

  const isVerbose = opts.verbose === true;

  for (const msg of messages) {
    if (msg.role === 'user') {
      outputHuman(cyan(`╔ User ${'═'.repeat(49)}╗`));
      outputHuman(formatContent(msg.content, isVerbose));
    } else if (msg.role === 'assistant') {
      outputHuman(green(`╔ Assistant ${'═'.repeat(44)}╗`));

      // Render tool use entries inline if present
      if (msg.toolCalls.length > 0) {
        for (const tool of msg.toolCalls) {
          outputHuman(dim(`  [${tool.name}] ${tool.status}`));
        }
      }

      if (msg.content.trim()) {
        outputHuman(formatContent(msg.content, isVerbose));
      }
    }
    outputHuman('');
  }
}

// ── Message extraction ─────────────────────────────────────────────────────

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls: Array<{ name: string; status: string }>;
}

/**
 * Extract messages from exported session data.
 *
 * Handles both `{ messages: [...] }` and array-of-messages formats.
 * Each message may have:
 *   - `role` or `type` field for role detection
 *   - `content` as string or array of content blocks
 *   - `tool_calls`, `tool_use`, or content blocks with type=tool_use
 */
function extractMessages(exported: unknown): ParsedMessage[] {
  if (exported === null || typeof exported !== 'object') {
    return [];
  }

  const obj = exported as Record<string, unknown>;
  let rawMessages: unknown[];

  if (Array.isArray(obj.messages)) {
    rawMessages = obj.messages;
  } else if (Array.isArray(exported)) {
    rawMessages = exported;
  } else {
    return [];
  }

  const result: ParsedMessage[] = [];

  for (const raw of rawMessages) {
    if (raw === null || typeof raw !== 'object') continue;
    const msg = raw as Record<string, unknown>;

    // Determine role — supports `role` or `type` field
    const roleField = (msg.role ?? msg.type) as string | undefined;
    if (!roleField) continue;

    let role: 'user' | 'assistant';
    if (roleField === 'user' || roleField === 'human') {
      role = 'user';
    } else if (roleField === 'assistant') {
      role = 'assistant';
    } else {
      // Skip system/tool-result messages
      continue;
    }

    // Extract text content
    const content = extractContent(msg.content);

    // Extract tool calls
    const toolCalls = extractToolCalls(msg);

    result.push({ role, content, toolCalls });
  }

  return result;
}

/**
 * Extract text content from various formats:
 *   - string: returned directly
 *   - array: join text blocks
 */
function extractContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block);
      } else if (block !== null && typeof block === 'object') {
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text);
        }
      }
    }
    return textParts.join('\n');
  }

  return '';
}

/**
 * Extract tool calls from a message object.
 *
 * Handles:
 *   - `tool_calls` array (OpenAI format)
 *   - `tool_use` in content blocks (Anthropic format)
 */
function extractToolCalls(msg: Record<string, unknown>): Array<{ name: string; status: string }> {
  const calls: Array<{ name: string; status: string }> = [];

  // Check tool_calls field
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (tc !== null && typeof tc === 'object') {
        const call = tc as Record<string, unknown>;
        const name = (typeof call.name === 'string' ? call.name : 'unknown');
        calls.push({ name, status: 'completed' });
      }
    }
  }

  // Check content blocks for tool_use type
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block !== null && typeof block === 'object') {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && typeof b.name === 'string') {
          calls.push({ name: b.name, status: 'completed' });
        }
        if (b.type === 'tool_result') {
          // Already captured via tool_use
        }
      }
    }
  }

  return calls;
}

/**
 * Format message content, optionally truncating for non-verbose mode.
 */
function formatContent(content: string, verbose: boolean): string {
  const trimmed = content.trim();
  if (!verbose && trimmed.length > 500) {
    return trimmed.slice(0, 500) + '... (truncated)';
  }
  return trimmed;
}

export { logCommand };
