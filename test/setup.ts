/**
 * Global Vitest setup: enforce PILOT_CONFIG_FILE isolation by default.
 *
 * Every test file runs with PILOT_CONFIG_FILE pointing at a nonexistent path
 * so that no test accidentally reads the developer's real ~/.pilot/config.json.
 *
 * Tests that explicitly need to test config file DISCOVERY (i.e. the HOME-based
 * path resolution) must set process.env.PILOT_CONFIG_FILE themselves within
 * the test body. The opt-out pattern is: set PILOT_CONFIG_FILE = real path in
 * the test, reset in afterEach.
 *
 * This module also resets the config cache before and after each test so that
 * cache state from one test cannot bleed into the next.
 */

import { beforeEach, afterEach } from 'vitest';
import { _resetConfigCache } from '../src/core/config.js';

const ISOLATED_PATH = '/nonexistent/pilot-suite-isolation';

beforeEach(() => {
  // Only apply isolation if the test has NOT already set PILOT_CONFIG_FILE.
  // This lets individual tests opt into a specific file or the discovery path.
  if (!process.env.PILOT_CONFIG_FILE) {
    process.env.PILOT_CONFIG_FILE = ISOLATED_PATH;
  }
  _resetConfigCache();
});

afterEach(() => {
  // Restore isolation sentinel if the test set it (so future tests aren't affected).
  // Tests that set their own path are responsible for cleaning up in their own afterEach;
  // the shared reset here ensures cache is always clean regardless.
  _resetConfigCache();
});
