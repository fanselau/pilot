import { describe, it, expect } from 'vitest';
import { scoreFromSignals } from '../../src/core/stuck.js';
import type { StuckAssessment } from '../../src/core/types.js';

/**
 * Stuck detection algorithm tests.
 *
 * Tests the pure scoring function `scoreFromSignals` which takes pre-fetched
 * signal data and returns a score + verdict. This enables testing without
 * mocking /proc filesystem.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Default input with all signals in "healthy" state */
function healthyInput() {
  return {
    logStaleness: 0,       // seconds — log just written
    runtime: 60,           // seconds — 1 minute runtime
    cpuSamples: [10, 12, 8], // active CPU %
    messageCount: 15,      // plenty of messages
    processRss: 256,       // MB — normal
    systemFreeMb: 4096,    // plenty of free memory
    procState: 'S' as string | null,  // sleeping (normal)
    wchan: 'ep_poll' as string | null, // normal wait channel
  };
}

// ── Signal 1: Log Staleness (max 50 points) ────────────────────────────────

describe('Signal 1: Log staleness', () => {
  it('scores 0 when log is fresh', () => {
    const result = scoreFromSignals({ ...healthyInput(), logStaleness: 10 });
    const logSignals = result.signals.filter(s => s.name.startsWith('log_stale'));
    expect(logSignals).toHaveLength(0);
  });

  it('scores 0 when log is stale but runtime is low', () => {
    // Log stale 20min but runtime only 5min — too early to flag
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 1200,
      runtime: 300,
    });
    const logSignals = result.signals.filter(s => s.name.startsWith('log_stale'));
    expect(logSignals).toHaveLength(0);
  });

  it('scores 20 when log stale > 5min AND runtime > 10min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 301, // > 5 min (300s)
      runtime: 601,      // > 10 min (600s)
    });
    const logSignal = result.signals.find(s => s.name === 'log_stale_5m');
    expect(logSignal).toBeDefined();
    expect(logSignal!.points).toBe(20);
  });

  it('scores 30 (not 20) when log stale > 15min AND runtime > 15min', () => {
    // Highest matching rule applies — should be 30, not 20+30
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 901, // > 15 min (900s)
      runtime: 901,      // > 15 min (900s)
    });
    const logSignals = result.signals.filter(s => s.name.startsWith('log_stale'));
    expect(logSignals).toHaveLength(1);
    expect(logSignals[0].name).toBe('log_stale_15m');
    expect(logSignals[0].points).toBe(30);
  });
});

// ── Signal 2: CPU Usage Trend (max 40 points) ──────────────────────────────

describe('Signal 2: CPU usage trend', () => {
  it('scores 0 with active CPU', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      cpuSamples: [10, 15, 8],
      runtime: 700,
    });
    const cpuSignals = result.signals.filter(s => s.name.startsWith('cpu_'));
    expect(cpuSignals).toHaveLength(0);
  });

  it('scores 0 when CPU is low but runtime is short', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      cpuSamples: [0.1, 0.0, 0.2],
      runtime: 300, // only 5 min
    });
    const cpuSignals = result.signals.filter(s => s.name.startsWith('cpu_'));
    expect(cpuSignals).toHaveLength(0);
  });

  it('scores 25 when maxCpu < 0.5% AND runtime > 10min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      cpuSamples: [0.3, 0.4, 0.2],
      runtime: 601,
    });
    const cpuZero = result.signals.find(s => s.name === 'cpu_zero');
    expect(cpuZero).toBeDefined();
    expect(cpuZero!.points).toBe(25);
  });

  it('scores additional 15 when ALL samples < 0.1%', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      cpuSamples: [0.05, 0.0, 0.09],
      runtime: 601,
    });
    const cpuFlatline = result.signals.find(s => s.name === 'cpu_flatline');
    expect(cpuFlatline).toBeDefined();
    expect(cpuFlatline!.points).toBe(15);
  });

  it('scores 40 cumulative (25 + 15) when all samples < 0.1%', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      cpuSamples: [0.05, 0.0, 0.09],
      runtime: 601,
    });
    const cpuSignals = result.signals.filter(s => s.name.startsWith('cpu_'));
    const totalCpuPoints = cpuSignals.reduce((sum, s) => sum + s.points, 0);
    expect(totalCpuPoints).toBe(40);
  });
});

// ── Signal 3: Session Message Count (max 40 points) ────────────────────────

describe('Signal 3: Session message count', () => {
  it('scores 0 with plenty of messages', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 20,
      runtime: 700,
    });
    const msgSignals = result.signals.filter(s => s.name.includes('messages'));
    expect(msgSignals).toHaveLength(0);
  });

  it('scores 40 with 0 messages AND runtime > 5min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 301,
    });
    const noMsg = result.signals.find(s => s.name === 'no_messages');
    expect(noMsg).toBeDefined();
    expect(noMsg!.points).toBe(40);
  });

  it('scores 0 with 0 messages but runtime < 5min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 299,
    });
    const msgSignals = result.signals.filter(s => s.name.includes('messages'));
    expect(msgSignals).toHaveLength(0);
  });

  it('scores 20 with < 3 messages AND runtime > 10min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 2,
      runtime: 601,
    });
    const fewMsg = result.signals.find(s => s.name === 'few_messages');
    expect(fewMsg).toBeDefined();
    expect(fewMsg!.points).toBe(20);
  });

  it('scores 0 when messageCount is null (unknown)', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: null as unknown as number,
      runtime: 601,
    });
    const msgSignals = result.signals.filter(s => s.name.includes('messages'));
    expect(msgSignals).toHaveLength(0);
  });

  it('prefers 40-point rule over 20-point for 0 messages', () => {
    // 0 messages + runtime > 10min matches BOTH rules;
    // should score 40 (the 0-messages rule), not 20
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 700,
    });
    const msgSignals = result.signals.filter(s => s.name.includes('messages'));
    expect(msgSignals).toHaveLength(1);
    expect(msgSignals[0].name).toBe('no_messages');
    expect(msgSignals[0].points).toBe(40);
  });
});

// ── Signal 4: Memory Pressure (max 20 points) ──────────────────────────────

describe('Signal 4: Memory pressure', () => {
  it('scores 0 with normal memory', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      processRss: 256,
      systemFreeMb: 4096,
    });
    const memSignals = result.signals.filter(s =>
      s.name === 'high_rss' || s.name === 'low_system_mem',
    );
    expect(memSignals).toHaveLength(0);
  });

  it('scores 10 when process RSS > 1024MB', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      processRss: 1025,
    });
    const highRss = result.signals.find(s => s.name === 'high_rss');
    expect(highRss).toBeDefined();
    expect(highRss!.points).toBe(10);
  });

  it('scores 10 when system free < 500MB', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      systemFreeMb: 400,
    });
    const lowMem = result.signals.find(s => s.name === 'low_system_mem');
    expect(lowMem).toBeDefined();
    expect(lowMem!.points).toBe(10);
  });

  it('scores 20 when both memory signals fire', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      processRss: 2048,
      systemFreeMb: 300,
    });
    const memSignals = result.signals.filter(s =>
      s.name === 'high_rss' || s.name === 'low_system_mem',
    );
    const totalMemPoints = memSignals.reduce((sum, s) => sum + s.points, 0);
    expect(totalMemPoints).toBe(20);
  });
});

// ── Signal 5: /proc/pid/status checks (max 80 points) ──────────────────────

describe('Signal 5: /proc/pid/status checks', () => {
  it('scores 0 for normal sleeping process', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'S',
      wchan: 'ep_poll',
    });
    const procSignals = result.signals.filter(s =>
      ['stopped', 'zombie', 'stdin_blocked'].includes(s.name),
    );
    expect(procSignals).toHaveLength(0);
  });

  it('scores 50 for stopped process (State T)', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'T',
    });
    const stopped = result.signals.find(s => s.name === 'stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.points).toBe(50);
  });

  it('scores 80 for zombie process (State Z)', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'Z',
    });
    const zombie = result.signals.find(s => s.name === 'zombie');
    expect(zombie).toBeDefined();
    expect(zombie!.points).toBe(80);
  });

  it('scores 30 for stdin-blocked (wchan matches read|wait|poll) AND runtime > 10min', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      wchan: 'read_chan',
      runtime: 601,
    });
    const blocked = result.signals.find(s => s.name === 'stdin_blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.points).toBe(30);
  });

  it('scores 0 for stdin-blocked pattern with short runtime', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      wchan: 'wait_for_input',
      runtime: 300,
    });
    const blocked = result.signals.find(s => s.name === 'stdin_blocked');
    expect(blocked).toBeUndefined();
  });

  it('handles null procState gracefully', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: null,
    });
    const procSignals = result.signals.filter(s =>
      ['stopped', 'zombie'].includes(s.name),
    );
    expect(procSignals).toHaveLength(0);
  });

  it('handles null wchan gracefully', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      wchan: null,
      runtime: 700,
    });
    const blocked = result.signals.find(s => s.name === 'stdin_blocked');
    expect(blocked).toBeUndefined();
  });
});

// ── Verdict Thresholds ──────────────────────────────────────────────────────

describe('Verdict thresholds', () => {
  it('returns healthy for score < 40', () => {
    // Just log staleness 5m: 20 points
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 301,
      runtime: 601,
    });
    expect(result.score).toBeLessThan(40);
    expect(result.verdict).toBe('healthy');
  });

  it('returns suspect for score 40-69', () => {
    // Stopped process: 50 points
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'T',
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.verdict).toBe('suspect');
  });

  it('returns stuck for score >= 70', () => {
    // Zombie process: 80 points
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'Z',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.verdict).toBe('stuck');
  });

  it('boundary: score exactly 39 is healthy', () => {
    // We need exactly 39 points. Strategy:
    // log_stale_5m (20) + low_system_mem (10) + high_rss (10) = 40 — too high
    // log_stale_5m (20) + high_rss (10) = 30 — too low
    // We need: 20 + 10 + 9 ... can't get 9 from any single signal
    // Alternative: Actually the point values are discrete (10, 15, 20, 25, 30, 40, 50, 80)
    // So exact 39 is impossible with current signal values.
    // Closest testable boundary: 30 → healthy
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 901,
      runtime: 901,
    });
    // 30 points from log staleness alone
    expect(result.score).toBe(30);
    expect(result.verdict).toBe('healthy');
  });

  it('boundary: score exactly 40 is suspect', () => {
    // 0 messages after 5min → 40 points
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 301,
    });
    expect(result.score).toBe(40);
    expect(result.verdict).toBe('suspect');
  });

  it('boundary: score exactly 70 is stuck', () => {
    // Log stale 15m (30) + cpu_zero (25) + cpu_flatline (15) = 70
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 901,
      runtime: 901,
      cpuSamples: [0.05, 0.0, 0.09],
    });
    expect(result.score).toBe(70);
    expect(result.verdict).toBe('stuck');
  });
});

// ── Combined Scenarios ──────────────────────────────────────────────────────

describe('Combined signal scenarios', () => {
  it('healthy process: low runtime, active log → ~0, healthy', () => {
    const result = scoreFromSignals(healthyInput());
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('healthy');
  });

  it('stale log only (15min stale, active CPU) → 30, healthy', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 901,
      runtime: 901,
      cpuSamples: [10, 15, 8],
    });
    expect(result.score).toBe(30);
    expect(result.verdict).toBe('healthy');
  });

  it('stale log + zero CPU → 30 + 25 + 15 = 70, stuck', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      logStaleness: 901,
      runtime: 901,
      cpuSamples: [0.05, 0.0, 0.09],
    });
    expect(result.score).toBe(70);
    expect(result.verdict).toBe('stuck');
  });

  it('zombie process → 80, stuck regardless of other signals', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'Z',
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.verdict).toBe('stuck');
  });

  it('stopped process → 50, suspect', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'T',
    });
    expect(result.score).toBe(50);
    expect(result.verdict).toBe('suspect');
  });

  it('no messages after 5min → 40, suspect', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 301,
    });
    expect(result.score).toBe(40);
    expect(result.verdict).toBe('suspect');
  });

  it('no messages + stale log → 40 + 30 = 70, stuck', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      messageCount: 0,
      runtime: 901,
      logStaleness: 901,
    });
    expect(result.score).toBe(70);
    expect(result.verdict).toBe('stuck');
  });

  it('high RSS + low system memory → 20, healthy', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      processRss: 2048,
      systemFreeMb: 300,
    });
    expect(result.score).toBe(20);
    expect(result.verdict).toBe('healthy');
  });

  it('stdin-blocked + stale log → 30 + 30 = 60, suspect', () => {
    const result = scoreFromSignals({
      ...healthyInput(),
      wchan: 'read_chan',
      runtime: 901,
      logStaleness: 901,
    });
    expect(result.score).toBe(60);
    expect(result.verdict).toBe('suspect');
  });

  it('everything bad: zombie + stale + no CPU + no messages + memory', () => {
    const result = scoreFromSignals({
      logStaleness: 1800,
      runtime: 1800,
      cpuSamples: [0.0, 0.0, 0.0],
      messageCount: 0,
      processRss: 2048,
      systemFreeMb: 300,
      procState: 'Z',
      wchan: 'read_chan',
    });
    // 30 + 25 + 15 + 40 + 10 + 10 + 80 + 30 = 240
    expect(result.score).toBe(240);
    expect(result.verdict).toBe('stuck');
  });
});

// ── Output Shape ────────────────────────────────────────────────────────────

describe('Output shape', () => {
  it('returns correct StuckScoreResult shape', () => {
    const result = scoreFromSignals(healthyInput());
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('signals');
    expect(typeof result.score).toBe('number');
    expect(['healthy', 'suspect', 'stuck']).toContain(result.verdict);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('each signal has name, points, and detail', () => {
    // Trigger at least one signal
    const result = scoreFromSignals({
      ...healthyInput(),
      procState: 'Z',
    });
    expect(result.signals.length).toBeGreaterThan(0);
    for (const signal of result.signals) {
      expect(signal).toHaveProperty('name');
      expect(signal).toHaveProperty('points');
      expect(signal).toHaveProperty('detail');
      expect(typeof signal.name).toBe('string');
      expect(typeof signal.points).toBe('number');
      expect(typeof signal.detail).toBe('string');
    }
  });
});

// ── Helper Functions (I/O layer) ────────────────────────────────────────────

describe('Helper function exports', () => {
  it('exports getLogStaleness', async () => {
    const { getLogStaleness } = await import('../../src/core/stuck.js');
    expect(typeof getLogStaleness).toBe('function');
  });

  it('exports sampleCpu', async () => {
    const { sampleCpu } = await import('../../src/core/stuck.js');
    expect(typeof sampleCpu).toBe('function');
  });

  it('exports getProcessRss', async () => {
    const { getProcessRss } = await import('../../src/core/stuck.js');
    expect(typeof getProcessRss).toBe('function');
  });

  it('exports getSystemFreeMem', async () => {
    const { getSystemFreeMem } = await import('../../src/core/stuck.js');
    expect(typeof getSystemFreeMem).toBe('function');
  });

  it('exports readProcState', async () => {
    const { readProcState } = await import('../../src/core/stuck.js');
    expect(typeof readProcState).toBe('function');
  });

  it('exports readProcWchan', async () => {
    const { readProcWchan } = await import('../../src/core/stuck.js');
    expect(typeof readProcWchan).toBe('function');
  });

  it('exports computeStuckScore', async () => {
    const { computeStuckScore } = await import('../../src/core/stuck.js');
    expect(typeof computeStuckScore).toBe('function');
  });
});

// ── I/O Helper Behavior (with real /proc on Linux) ──────────────────────────

describe('I/O helpers: getLogStaleness', () => {
  it('returns Infinity for missing log file', async () => {
    const { getLogStaleness } = await import('../../src/core/stuck.js');
    const staleness = await getLogStaleness('/nonexistent/path/log.txt');
    expect(staleness).toBe(Infinity);
  });
});

describe('I/O helpers: getProcessRss', () => {
  it('returns 0 for non-existent PID', async () => {
    const { getProcessRss } = await import('../../src/core/stuck.js');
    const rss = await getProcessRss(999999999);
    expect(rss).toBe(0);
  });
});

describe('I/O helpers: getSystemFreeMem', () => {
  it('returns a positive number on Linux', async () => {
    const { getSystemFreeMem } = await import('../../src/core/stuck.js');
    const freeMem = await getSystemFreeMem();
    // On any running system, free memory should be > 0
    expect(freeMem).toBeGreaterThan(0);
  });
});

describe('I/O helpers: readProcState', () => {
  it('returns null for non-existent PID', async () => {
    const { readProcState } = await import('../../src/core/stuck.js');
    const state = await readProcState(999999999);
    expect(state).toBeNull();
  });

  it('returns a valid state letter for current process', async () => {
    const { readProcState } = await import('../../src/core/stuck.js');
    const state = await readProcState(process.pid);
    // Current process should be R (running) or S (sleeping)
    expect(state).not.toBeNull();
    expect(['R', 'S', 'D', 'Z', 'T']).toContain(state);
  });
});

describe('I/O helpers: readProcWchan', () => {
  it('returns null for non-existent PID', async () => {
    const { readProcWchan } = await import('../../src/core/stuck.js');
    const wchan = await readProcWchan(999999999);
    expect(wchan).toBeNull();
  });
});

describe('I/O helpers: sampleCpu', () => {
  it('returns 0 for non-existent PID', async () => {
    const { sampleCpu } = await import('../../src/core/stuck.js');
    // Single sample with short interval for non-existent PID
    const samples = await sampleCpu(999999999, 1, 10);
    expect(samples).toEqual([0]);
  });
});
