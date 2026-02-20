/**
 * Weighted multi-signal stuck detection algorithm.
 *
 * Evaluates 5 independent signals to score whether a process is stuck.
 * Pure core module — no UI dependencies.
 *
 * Stub: RED phase — tests written, implementation pending.
 */

import type { StuckAssessment, StuckSignal } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StuckSignalInput {
  logStaleness: number;
  runtime: number;
  cpuSamples: number[];
  messageCount: number | null;
  processRss: number;
  systemFreeMb: number;
  procState: string | null;
  wchan: string | null;
}

export interface StuckScoreResult {
  score: number;
  verdict: 'healthy' | 'suspect' | 'stuck';
  signals: StuckSignal[];
}

// ── Pure Scoring Function ──────────────────────────────────────────────────

function scoreFromSignals(_input: StuckSignalInput): StuckScoreResult {
  throw new Error('Not implemented');
}

// ── I/O Helper Functions ───────────────────────────────────────────────────

async function getLogStaleness(_logFile: string): Promise<number> {
  throw new Error('Not implemented');
}

async function sampleCpu(_pid: number, _count: number, _intervalMs: number): Promise<number[]> {
  throw new Error('Not implemented');
}

async function getProcessRss(_pid: number): Promise<number> {
  throw new Error('Not implemented');
}

async function getSystemFreeMem(): Promise<number> {
  throw new Error('Not implemented');
}

async function readProcState(_pid: number): Promise<string | null> {
  throw new Error('Not implemented');
}

async function readProcWchan(_pid: number): Promise<string | null> {
  throw new Error('Not implemented');
}

async function computeStuckScore(_pid: number, _session: string): Promise<StuckAssessment> {
  throw new Error('Not implemented');
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
  scoreFromSignals,
  getLogStaleness,
  sampleCpu,
  getProcessRss,
  getSystemFreeMem,
  readProcState,
  readProcWchan,
  computeStuckScore,
};
