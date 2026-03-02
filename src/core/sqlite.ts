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

let DatabaseImpl: any;

if (isBun) {
  const BunSqlite = require('bun:sqlite');

  DatabaseImpl = function BunCompat(filename: string, options?: any) {
    const db = new BunSqlite.Database(filename, {
      readonly: options?.readonly ?? false,
      create: !(options?.fileMustExist),
    });
    db.pragma = function(pragma: string, value?: any) {
      if (value !== undefined) {
        db.exec(`PRAGMA ${pragma} = ${value}`);
      } else {
        return db.prepare(`PRAGMA ${pragma}`).get();
      }
    };
    return db;
  } as any;
} else {
  DatabaseImpl = require('better-sqlite3');
}

export default DatabaseImpl;
export { isBun };
export type { Database } from 'better-sqlite3';
