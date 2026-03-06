/**
 * SQLite compatibility layer.
 * Uses bun:sqlite when running in Bun, better-sqlite3 when running in Node.
 *
 * Types always come from better-sqlite3 (dev dependency).
 * Runtime implementation switches based on environment.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const isBun = typeof (globalThis as any).Bun !== 'undefined';

/**
 * Allowlist of PRAGMA names that may be executed via the db.pragma() wrapper.
 * Prevents SQL injection through untrusted pragma name strings.
 */
const ALLOWED_PRAGMAS = new Set([
  'journal_mode',
  'busy_timeout',
  'wal_checkpoint',
  'foreign_keys',
  'cache_size',
  'synchronous',
  'temp_store',
  'mmap_size',
  'page_size',
  'wal_autocheckpoint',
]);

/**
 * Validate a PRAGMA name against the allowlist.
 * Throws if the name is not recognized.
 */
function validatePragma(pragma: string): void {
  // Extract just the pragma name (before any " = value" suffix from better-sqlite3 style calls)
  const name = pragma.split(/[\s=]/)[0].toLowerCase();
  if (!ALLOWED_PRAGMAS.has(name)) {
    throw new Error(`Disallowed PRAGMA: ${pragma}`);
  }
}

let DatabaseImpl: any;

if (isBun) {
  const BunSqlite = require('bun:sqlite');

  DatabaseImpl = function BunCompat(filename: string, options?: any) {
    const db = new BunSqlite.Database(filename, {
      readonly: options?.readonly ?? false,
      create: !(options?.fileMustExist),
    });
    db.pragma = function(pragma: string, value?: any) {
      validatePragma(pragma);
      if (value !== undefined) {
        db.exec(`PRAGMA ${pragma} = ${value}`);
      } else {
        return db.prepare(`PRAGMA ${pragma}`).get();
      }
    };
    return db;
  } as any;
} else {
  // Wrap better-sqlite3 to add PRAGMA validation
  const RealDatabase = require('better-sqlite3');
  DatabaseImpl = function ValidatedDatabase(filename: string, options?: any) {
    const db = new RealDatabase(filename, options);
    const originalPragma = db.pragma.bind(db);
    db.pragma = function(pragma: string, ...args: any[]) {
      validatePragma(pragma);
      return originalPragma(pragma, ...args);
    };
    return db;
  } as any;
}

export default DatabaseImpl;
export { isBun };
export type { Database } from 'better-sqlite3';
