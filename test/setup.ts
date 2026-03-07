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

const ISOLATED_CONFIG_PATH = '/nonexistent/pilot-suite-isolation';
const ISOLATED_HOME = '/nonexistent/pilot-suite-home';

let originalHome: string | undefined;

beforeEach(() => {
  // Isolate HOME so that os.homedir()-based config discovery never reads the
  // developer's real ~/.pilot/config.json. PILOT_CONFIG_FILE takes precedence
  // over HOME, but isolating both prevents any code path from accidentally
  // touching the real home directory.
  originalHome = process.env.HOME;
  process.env.HOME = ISOLATED_HOME;

  // Only apply PILOT_CONFIG_FILE isolation if the test has NOT already set it.
  // This lets individual tests opt into a specific file or the discovery path.
  if (!process.env.PILOT_CONFIG_FILE) {
    process.env.PILOT_CONFIG_FILE = ISOLATED_CONFIG_PATH;
  }
  _resetConfigCache();
});

afterEach(() => {
  // Restore original HOME so the process isn't permanently altered.
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }

  // Tests that set their own PILOT_CONFIG_FILE are responsible for cleaning
  // up in their own afterEach; the shared reset here ensures cache is always
  // clean regardless.
  _resetConfigCache();
});
