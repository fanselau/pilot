import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import { getConfig } from '../../src/core/config.js';

describe('getConfig', () => {
  const originalEnv = { ...process.env };
  const home = os.homedir();

  beforeEach(() => {
    // Clear all PILOT_* env vars before each test
    delete process.env.PILOT_QUEUE_FILE;
    delete process.env.PILOT_LOG_DIR;
    delete process.env.PILOT_STUCK_THRESHOLD;
    delete process.env.PILOT_PROJECT_DIR;
    delete process.env.PILOT_GSD_DIR;
    delete process.env.PILOT_MAX_PARALLEL;
    delete process.env.PILOT_LOG_LEVEL;
    delete process.env.PILOT_POLL_INTERVAL;
    delete process.env.PILOT_DEFAULT_TIMEOUT;
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('default values', () => {
    it('returns correct defaults when no env vars set', () => {
      const config = getConfig();

      expect(config.queueFile).toBe(`${home}/dev/QUEUE.md`);
      expect(config.logDir).toBe('/tmp');
      expect(config.stuckThreshold).toBe(90);
      expect(config.projectDir).toBe(`${home}/dev/punchlab`);
      expect(config.gsdDir).toBe(`${home}/dev/pilot-gsd`);
      expect(config.noColor).toBe(false);
    });
  });

  describe('env var overrides', () => {
    it('respects PILOT_QUEUE_FILE', () => {
      process.env.PILOT_QUEUE_FILE = '/custom/QUEUE.md';
      const config = getConfig();
      expect(config.queueFile).toBe('/custom/QUEUE.md');
    });

    it('respects PILOT_LOG_DIR', () => {
      process.env.PILOT_LOG_DIR = '/var/log/pilot';
      const config = getConfig();
      expect(config.logDir).toBe('/var/log/pilot');
    });

    it('respects PILOT_STUCK_THRESHOLD as number', () => {
      process.env.PILOT_STUCK_THRESHOLD = '120';
      const config = getConfig();
      expect(config.stuckThreshold).toBe(120);
    });

    it('falls back to 90 for invalid PILOT_STUCK_THRESHOLD', () => {
      process.env.PILOT_STUCK_THRESHOLD = 'not-a-number';
      const config = getConfig();
      expect(config.stuckThreshold).toBe(90);
    });

    it('respects PILOT_PROJECT_DIR', () => {
      process.env.PILOT_PROJECT_DIR = '/projects';
      const config = getConfig();
      expect(config.projectDir).toBe('/projects');
    });

    it('respects PILOT_GSD_DIR', () => {
      process.env.PILOT_GSD_DIR = '/custom/gsd';
      const config = getConfig();
      expect(config.gsdDir).toBe('/custom/gsd');
    });
  });

  describe('NO_COLOR detection', () => {
    it('returns noColor true when NO_COLOR is set to any value', () => {
      process.env.NO_COLOR = '1';
      const config = getConfig();
      expect(config.noColor).toBe(true);
    });

    it('returns noColor true when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = '';
      const config = getConfig();
      expect(config.noColor).toBe(true);
    });

    it('returns noColor false when NO_COLOR is unset', () => {
      delete process.env.NO_COLOR;
      const config = getConfig();
      expect(config.noColor).toBe(false);
    });
  });

  describe('tilde expansion', () => {
    it('expands ~ in PILOT_QUEUE_FILE', () => {
      process.env.PILOT_QUEUE_FILE = '~/custom/QUEUE.md';
      const config = getConfig();
      expect(config.queueFile).toBe(`${home}/custom/QUEUE.md`);
    });

    it('expands ~ in PILOT_LOG_DIR', () => {
      process.env.PILOT_LOG_DIR = '~/logs';
      const config = getConfig();
      expect(config.logDir).toBe(`${home}/logs`);
    });

    it('expands ~ in PILOT_PROJECT_DIR', () => {
      process.env.PILOT_PROJECT_DIR = '~/projects';
      const config = getConfig();
      expect(config.projectDir).toBe(`${home}/projects`);
    });

    it('expands ~ in PILOT_GSD_DIR', () => {
      process.env.PILOT_GSD_DIR = '~/gsd';
      const config = getConfig();
      expect(config.gsdDir).toBe(`${home}/gsd`);
    });

    it('does not expand ~ in the middle of a path', () => {
      process.env.PILOT_QUEUE_FILE = '/some/~/path/QUEUE.md';
      const config = getConfig();
      expect(config.queueFile).toBe('/some/~/path/QUEUE.md');
    });
  });

  describe('maxParallel auto-detection', () => {
    it('defaults to 2 on systems with <32GB RAM', () => {
      // Mock totalmem to return 16GB
      const spy = vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024);
      delete process.env.PILOT_MAX_PARALLEL;

      const config = getConfig();
      expect(config.maxParallel).toBe(2);

      spy.mockRestore();
    });

    it('defaults to 5 on systems with >=32GB RAM', () => {
      // Mock totalmem to return 64GB
      const spy = vi.spyOn(os, 'totalmem').mockReturnValue(64 * 1024 * 1024 * 1024);
      delete process.env.PILOT_MAX_PARALLEL;

      const config = getConfig();
      expect(config.maxParallel).toBe(5);

      spy.mockRestore();
    });

    it('PILOT_MAX_PARALLEL overrides auto-detection', () => {
      process.env.PILOT_MAX_PARALLEL = '3';
      const config = getConfig();
      expect(config.maxParallel).toBe(3);
    });
  });

  describe('logLevel', () => {
    it('defaults to INFO when not set', () => {
      delete process.env.PILOT_LOG_LEVEL;
      const config = getConfig();
      expect(config.logLevel).toBe('INFO');
    });

    it('accepts valid log levels', () => {
      process.env.PILOT_LOG_LEVEL = 'DEBUG';
      expect(getConfig().logLevel).toBe('DEBUG');

      process.env.PILOT_LOG_LEVEL = 'WARN';
      expect(getConfig().logLevel).toBe('WARN');

      process.env.PILOT_LOG_LEVEL = 'ERROR';
      expect(getConfig().logLevel).toBe('ERROR');
    });

    it('falls back to INFO for invalid log level', () => {
      process.env.PILOT_LOG_LEVEL = 'invalid';
      const config = getConfig();
      expect(config.logLevel).toBe('INFO');
    });

    it('is case-insensitive', () => {
      process.env.PILOT_LOG_LEVEL = 'debug';
      const config = getConfig();
      expect(config.logLevel).toBe('DEBUG');
    });
  });
});
