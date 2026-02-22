# Spawn Lessons — Hard-Won Knowledge from v1

These are battle-tested patterns from v1 that MUST be preserved in v2.
The v2 executor should read this file before implementing spawn/runner.

## 1. Git GC on Snapshot Repos (Critical)

opencode stores snapshots in `~/.local/share/opencode/snapshot/*/`. These are git repos
that grow to 8GB+. If `gc.auto` is enabled, git pack-objects triggers during sessions
and causes 179% CPU → SIGKILL.

**Fix:** Before ANY spawn, disable gc on ALL snapshot repos:
```typescript
// MUST iterate all subdirs AND explicitly handle the global repo
const snapshotBase = path.join(homedir(), '.local', 'share', 'opencode', 'snapshot');
const entries = await readdir(snapshotBase, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isDirectory()) {
    await execa('git', ['-C', path.join(snapshotBase, entry.name), 'config', 'gc.auto', '0']);
  }
}
// CRITICAL: global repo is NOT matched by the directory iteration
await execa('git', ['-C', path.join(snapshotBase, 'global'), 'config', 'gc.auto', '0']);
```

## 2. setsid, NEVER nohup (Critical)

nohup closes stdin → opencode sessions die mid-execution. ALWAYS use `detached: true` 
(which is setsid under the hood) with `stdin: 'ignore'`.

```typescript
const proc = execa(binary, args, {
  cwd: projectDir,
  stdin: 'ignore',    // equivalent to < /dev/null
  detached: true,     // equivalent to setsid (NEVER nohup)
  cleanup: false,     // don't kill child when parent exits
});
proc.unref();         // parent can exit without waiting
```

## 3. Memory Check Before Spawn (Important)

On a 16GB VPS, 4+ parallel opencode sessions = OOM = silent death.
Check `/proc/meminfo` for AvailableMem before spawning. Wait if < 2GB.

```typescript
const content = await readFile('/proc/meminfo', 'utf8');
const match = content.match(/MemAvailable:\s+(\d+)\s+kB/);
const availableMb = parseInt(match[1]) / 1024;
if (availableMb < 2048) { /* wait or reject */ }
```

## 4. Spawn Rate Limiting (Important)

Minimum 5 seconds between spawns. Prevents thundering herd when queue has many items.

## 5. Title Truncation (Important)

Session titles become file names. Max 80 chars. Sanitize non-alphanumeric to hyphens.
Without this: ENAMETOOLONG errors that silently fail.

## 6. Binary Resolution (Useful)

opencode may not be in PATH. Check `~/.opencode/bin/opencode` as fallback.

## 7. Config Validation (Useful)

Check that the project's `opencode.json` exists and has `"permission": "allow"` (SINGULAR, not "permissions").
Wrong key = "Unrecognized key" error = ALL sessions die immediately.

## 8. opencode.json Instructions Must Be Array

`"instructions": "string"` crashes. Must be `"instructions": ["string"]`.

## 9. Disk Space Check (Useful)

Check `statfs()` for available space. opencode snapshots grow fast.
Threshold: warn at < 5GB, reject at < 1GB.
