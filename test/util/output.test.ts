import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setJsonMode, isJsonMode, outputJson, outputHuman } from '../../src/util/output.js';

describe('output', () => {
  beforeEach(() => {
    setJsonMode(false);
  });

  describe('isJsonMode', () => {
    it('returns false by default', () => {
      expect(isJsonMode()).toBe(false);
    });

    it('returns true when set', () => {
      setJsonMode(true);
      expect(isJsonMode()).toBe(true);
    });

    it('returns false when reset', () => {
      setJsonMode(true);
      setJsonMode(false);
      expect(isJsonMode()).toBe(false);
    });
  });

  describe('outputJson', () => {
    it('writes JSON with timestamp to stdout', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      outputJson({ foo: 'bar' });

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const output = writeSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.foo).toBe('bar');
      expect(parsed.timestamp).toBeDefined();
      expect(typeof parsed.timestamp).toBe('string');
      // Verify ISO 8601 format
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);

      writeSpy.mockRestore();
    });

    it('adds timestamp field automatically', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      outputJson({ data: 123 });

      const output = writeSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('data', 123);

      writeSpy.mockRestore();
    });

    it('outputs pretty-printed JSON', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      outputJson({ a: 1 });

      const output = writeSpy.mock.calls[0]![0] as string;
      // Pretty-printed JSON has newlines
      expect(output).toContain('\n');
      // Ends with newline
      expect(output.endsWith('\n')).toBe(true);

      writeSpy.mockRestore();
    });
  });

  describe('outputHuman', () => {
    it('writes text to stdout when not in json mode', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      outputHuman('Hello, world!');

      expect(writeSpy).toHaveBeenCalledWith('Hello, world!\n');

      writeSpy.mockRestore();
    });

    it('suppresses output when in json mode', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      setJsonMode(true);

      outputHuman('Should not appear');

      expect(writeSpy).not.toHaveBeenCalled();

      writeSpy.mockRestore();
    });
  });
});
