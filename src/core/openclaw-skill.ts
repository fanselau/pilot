/**
 * OpenClaw skill installation module.
 *
 * Copies the bundled SKILL.md to ~/.openclaw/skills/pilot-pipeline/
 * so OpenClaw agents can use it for Pilot CLI orchestration.
 *
 * This is completely separate from the pilot skills system (~/.pilot/skills/).
 * This targets OpenClaw's skill directory (~/.openclaw/skills/).
 *
 * Standalone — no dependency on getConfig() or any pilot core module.
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Path Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the path to the bundled SKILL.md source file.
 * Works for both:
 *   - npm-installed: dist/ → package root
 *   - locally-linked / dev: src/ → package root
 */
export function getSkillSourcePath(): string {
  const pkgRoot = path.resolve(import.meta.dirname, '..');
  return path.join(pkgRoot, 'skills', 'openclaw-pilot', 'SKILL.md');
}

// ── Install Function ──────────────────────────────────────────────────────

/**
 * Install the bundled OpenClaw skill to ~/.openclaw/skills/pilot-pipeline/.
 *
 * - If ~/.openclaw/ doesn't exist, OpenClaw is not detected → skip silently.
 * - If the bundled SKILL.md source is missing → skip silently (graceful fallback).
 * - Creates ~/.openclaw/skills/pilot-pipeline/ if needed.
 * - Copies SKILL.md to the target directory.
 *
 * Returns { installed: true, path } on success, { installed: false, path: null } on skip.
 */
export function installOpenClawSkill(): { installed: boolean; path: string | null } {
  const home = os.homedir();
  const openclawDir = path.join(home, '.openclaw');

  // Check if OpenClaw is installed
  if (!existsSync(openclawDir)) {
    return { installed: false, path: null };
  }

  // Resolve bundled SKILL.md source
  const skillSource = getSkillSourcePath();
  if (!existsSync(skillSource)) {
    return { installed: false, path: null };
  }

  // Create target directory
  const targetDir = path.join(openclawDir, 'skills', 'pilot-pipeline');
  mkdirSync(targetDir, { recursive: true });

  // Copy SKILL.md
  const targetPath = path.join(targetDir, 'SKILL.md');
  copyFileSync(skillSource, targetPath);

  return { installed: true, path: targetPath };
}
