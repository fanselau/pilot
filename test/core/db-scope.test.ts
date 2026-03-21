/**
 * Regression tests for 5-scope CHECK constraint support in pilot.db.
 *
 * Verifies that debug and fast scopes can be inserted without CHECK constraint
 * failure, fast scope auto-sets skip_grace_period=1, and existing scopes are
 * unaffected.
 *
 * Uses in-memory database via _getTestDb() for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetConfigCache } from '../../src/core/config.js';
import {
  addJob,
  _getTestDb,
} from '../../src/core/db.js';
import type { Database as DatabaseType } from '../../src/core/sqlite.js';

describe('db scope constraint', () => {
  let db: DatabaseType;

  beforeEach(() => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/pilot-test-isolation';
    _resetConfigCache();
    db = _getTestDb();
  });

  afterEach(() => {
    delete process.env.PILOT_CONFIG_FILE;
    _resetConfigCache();
  });

  it('addJob with scope=fast succeeds without CHECK constraint error', () => {
    const job = addJob('/test/project', 'fast', 'test fast job');
    expect(job.scope).toBe('fast');
  });

  it('addJob with scope=debug succeeds without CHECK constraint error', () => {
    const job = addJob('/test/project', 'debug', 'test debug job');
    expect(job.scope).toBe('debug');
  });

  it('fast scope sets skip_grace_period=1 automatically', () => {
    const job = addJob('/test/project', 'fast', 'test fast skip grace');
    const row = db.prepare('SELECT skip_grace_period FROM jobs WHERE id = ?').get(job.id) as { skip_grace_period: number };
    expect(row.skip_grace_period).toBe(1);
  });

  it('debug scope does NOT auto-set skip_grace_period', () => {
    const job = addJob('/test/project', 'debug', 'test debug no skip grace');
    const row = db.prepare('SELECT skip_grace_period FROM jobs WHERE id = ?').get(job.id) as { skip_grace_period: number };
    expect(row.skip_grace_period).toBe(0);
  });

  it('existing scope quick still works after migration', () => {
    const job = addJob('/test/project', 'quick', 'test quick job');
    expect(job.scope).toBe('quick');
  });

  it('existing scope phase still works after migration', () => {
    const job = addJob('/test/project', 'phase', 'test phase job');
    expect(job.scope).toBe('phase');
  });

  it('existing scope milestone still works after migration', () => {
    const job = addJob('/test/project', 'milestone', 'test milestone job');
    expect(job.scope).toBe('milestone');
  });
});
