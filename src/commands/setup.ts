/**
 * `pilot setup <dir>` — Set up a project directory for Pilot.
 *
 * Creates .opencode/ with symlinks to pilot-gsd, generates opencode.json,
 * adds .opencode/ to .gitignore, and initializes git if needed.
 *
 * With --verify, checks an existing setup without modifying anything.
 * With --owner <agentId>, registers the project with an owner agent ID.
 * With --update, updates the owner of an existing registered project.
 */

import path from 'node:path';
import { setupProject, verifySetup } from '../core/setup.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';

interface SetupOptions {
  verify?: boolean;
  owner?: string;    // agent ID to register as project owner
  update?: boolean;  // if true, update owner of existing project
}

async function setupCommand(dir: string, opts: SetupOptions): Promise<void> {
  if (opts.verify) {
    const result = await verifySetup(dir);

    if (isJsonMode()) {
      outputJson({ verify: result });
      return;
    }

    outputHuman('');
    outputHuman(`  ${bold('Setup Verification')}: ${dir}`);
    outputHuman('');
    for (const f of result.findings) {
      const icon =
        f.status === 'pass' ? green('✓') : f.status === 'fail' ? red('✗') : yellow('⚠');
      outputHuman(`  ${icon} ${f.label.padEnd(24)} ${dim(f.detail)}`);
    }
    outputHuman('');
    outputHuman(
      `  ${result.passed} passed, ${result.failed} failed, ${result.warnings} warnings`,
    );
    outputHuman('');

    if (result.failed > 0) {
      process.exit(1);
    }
    return;
  }

  const result = await setupProject(dir);

  if (isJsonMode()) {
    outputJson({ setup: result });
    return;
  }

  for (const item of result.created) {
    outputHuman(`  ${green('✓')} ${item}`);
  }
  for (const item of result.skipped) {
    outputHuman(`  ${dim('⊘')} ${item} ${dim('(skipped)')}`);
  }
  for (const item of result.errors) {
    outputHuman(`  ${red('✗')} ${item}`);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }

  // After setup completes successfully, handle owner registration
  if (!opts.owner && !isJsonMode()) {
    outputHuman('');
    outputHuman(`  ${dim('Hint: Register this project with an owner to enable notifications:')}`);
    outputHuman(`  ${dim('pilot setup')} ${dir} ${dim('--owner <agent-id>')}`);
    outputHuman('');
  }

  if (opts.owner) {
    const { registerProject, updateProjectOwner, getProject } = await import('../core/db.js');
    const absDir = path.resolve(dir);
    if (opts.update) {
      const existing = getProject(absDir);
      if (!existing) {
        process.stderr.write(`  ✗ Project not registered: ${absDir}\n`);
        process.exit(1);
      }
      updateProjectOwner(absDir, opts.owner);
      outputHuman(`  ${green('✓')} Updated owner: ${opts.owner}`);
    } else {
      registerProject(absDir, opts.owner);
      outputHuman(`  ${green('✓')} Registered project owner: ${opts.owner}`);
    }
  }

  // ── Optional: offer recommended skills ──────────────────────────────────
  if (result.errors.length === 0 && !isJsonMode()) {
    try {
      const { recommendDefaultSkills, bootstrapDefaultSkills } = await import('../core/default-skills.js');
      const absSkillDir = path.resolve(dir);
      const recommendation = recommendDefaultSkills(absSkillDir);

      if (recommendation.skills.length > 0) {
        outputHuman('');

        // Show detected stack
        if (recommendation.detectedStack.items.length > 0) {
          outputHuman(`  ${dim('Detected stack:')} ${recommendation.detectedStack.items.join(', ')}`);
        }

        outputHuman(`  ${dim(`${recommendation.skills.length} recommended skills available`)}`);

        // Only prompt if TTY
        if (process.stdin.isTTY) {
          const readline = await import('node:readline');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

          const answer = await new Promise<string>(resolve => {
            rl.question('  Install recommended skills? (Y/n) ', resolve);
          });
          rl.close();

          if (answer.toLowerCase() !== 'n') {
            const bootstrapResult = await bootstrapDefaultSkills({ projectDir: absSkillDir, yes: true });

            outputHuman('');
            for (const err of bootstrapResult.errors) {
              outputHuman(`  ${yellow('⚠')} ${err.skill}: ${dim(err.error)}`);
            }
            if (bootstrapResult.installed > 0) {
              outputHuman(`  ${green('✓')} Installed ${bootstrapResult.installed} skills`);
            }
            if (bootstrapResult.failed > 0) {
              outputHuman(`  ${dim(`${bootstrapResult.failed} failed (see warnings above)`)}`);
            }
          }
        } else {
          outputHuman(`  ${dim('Run `pilot skills bootstrap --yes` to install')}`);
        }
      }
    } catch (err) {
      // Non-fatal: skill bootstrap failure must NEVER make setup fail
      process.stderr.write(`Warning: skill recommendation failed: ${err}\n`);
    }
  }

  // Trigger init if no config file exists
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  const configPath = join(homedir(), '.pilot', 'config.json');
  if (!existsSync(configPath) && !isJsonMode()) {
    outputHuman('');
    outputHuman(dim(`  No config file found. Running initial configuration...`));
    outputHuman('');
    const { initCommand } = await import('./init.js');
    await initCommand({});
  }
}

export { setupCommand };
