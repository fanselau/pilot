import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { isMap, parseDocument } from 'yaml';

import type {
  HumanVerificationItem,
  VerificationArtifactSnapshot,
  VerificationGap,
  VerificationRoutingSnapshot,
  VerificationStatus,
} from './types.js';

const VERIFIED_STATUSES = new Set<VerificationStatus>(['passed', 'gaps_found', 'human_needed']);

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item))
    .filter((item): item is string => item !== null);
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeVerificationStatus(value: unknown): VerificationStatus {
  const status = asText(value);
  if (!status) return 'unrecognized';
  return VERIFIED_STATUSES.has(status as VerificationStatus)
    ? status as VerificationStatus
    : 'unrecognized';
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const doc = parseDocument(match[1]);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    return null;
  }

  return doc.toJSON() as Record<string, unknown>;
}

function normalizeGap(entry: unknown): VerificationGap {
  if (typeof entry === 'string') {
    return {
      truth: asText(entry),
      status: null,
      reason: null,
      artifacts: [],
      missing: [],
      actionable: true,
    };
  }

  const gap = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
  const humanOnly =
    asBoolean(gap.human_only)
    ?? asBoolean(gap.humanOnly)
    ?? (asBoolean(gap.actionable) === false ? true : null)
    ?? false;

  return {
    truth: asText(gap.truth) ?? asText(gap.title) ?? asText(gap.gap),
    status: asText(gap.status),
    reason: asText(gap.reason),
    artifacts: asStringArray(gap.artifacts),
    missing: asStringArray(gap.missing),
    actionable: !humanOnly,
  };
}

function normalizeHumanVerification(entry: unknown): HumanVerificationItem {
  if (typeof entry === 'string') {
    return {
      test: asText(entry),
      expected: null,
      whyHuman: null,
    };
  }

  const item = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
  return {
    test: asText(item.test) ?? asText(item.check),
    expected: asText(item.expected),
    whyHuman: asText(item.why_human) ?? asText(item.whyHuman),
  };
}

function unavailableSnapshot(reason: string, artifactPath: string | null = null): VerificationArtifactSnapshot {
  return {
    available: false,
    verificationStatus: 'unavailable',
    artifactPath,
    unavailableReason: reason,
    gaps: [],
    humanVerification: [],
  };
}

function listVerificationArtifacts(projectDir: string, phaseNumber: number): string[] {
  const phasesDir = path.join(projectDir, '.planning', 'phases');
  const phasePrefix = `${phaseNumber}-`;
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];

  for (const phaseDirEntry of readdirSync(phasesDir, { withFileTypes: true })) {
    if (!phaseDirEntry.isDirectory() || !phaseDirEntry.name.startsWith(phasePrefix)) continue;

    const phaseDir = path.join(phasesDir, phaseDirEntry.name);
    for (const artifactEntry of readdirSync(phaseDir, { withFileTypes: true })) {
      if (!artifactEntry.isFile() || !artifactEntry.name.endsWith('-VERIFICATION.md')) continue;
      const filePath = path.join(phaseDir, artifactEntry.name);
      candidates.push({ filePath, mtimeMs: statSync(filePath).mtimeMs });
    }
  }

  return candidates
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.filePath.localeCompare(left.filePath))
    .map((candidate) => candidate.filePath);
}

function readArtifactSnapshot(artifactPath: string): VerificationArtifactSnapshot {
  let content: string;
  try {
    content = readFileSync(artifactPath, 'utf8');
  } catch {
    return unavailableSnapshot('verification-artifact-unreadable', artifactPath);
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return unavailableSnapshot('verification-artifact-unreadable', artifactPath);
  }

  return {
    available: true,
    verificationStatus: normalizeVerificationStatus(frontmatter.status),
    artifactPath,
    unavailableReason: null,
    gaps: Array.isArray(frontmatter.gaps) ? frontmatter.gaps.map((entry) => normalizeGap(entry)) : [],
    humanVerification: Array.isArray(frontmatter.human_verification)
      ? frontmatter.human_verification.map((entry) => normalizeHumanVerification(entry))
      : [],
  };
}

function readLatestVerificationArtifact(projectDir: string, phaseNumber: number): VerificationArtifactSnapshot {
  let artifacts: string[];
  try {
    artifacts = listVerificationArtifacts(projectDir, phaseNumber);
  } catch {
    return unavailableSnapshot('verification-artifact-missing');
  }

  if (artifacts.length === 0) {
    return unavailableSnapshot('verification-artifact-missing');
  }

  return readArtifactSnapshot(artifacts[0]);
}

function deriveVerificationRouting(snapshot: VerificationArtifactSnapshot): VerificationRoutingSnapshot {
  const actionableGapCount = snapshot.gaps.filter((gap) => gap.actionable).length;
  const humanVerificationCount = snapshot.humanVerification.length;

  if (!snapshot.available) {
    const reason = snapshot.unavailableReason ?? 'verification-artifact-unavailable';
    return {
      verificationStatus: snapshot.verificationStatus,
      actionableGapCount,
      humanVerificationCount,
      routingDecision: 'review-hold',
      routingReason: `Structured verification unavailable: ${reason}`,
      artifactPath: snapshot.artifactPath,
      artifactAvailable: false,
      unavailableReason: reason,
    };
  }

  if (snapshot.verificationStatus === 'passed') {
    return {
      verificationStatus: snapshot.verificationStatus,
      actionableGapCount,
      humanVerificationCount,
      routingDecision: 'complete',
      routingReason: 'Structured verification passed',
      artifactPath: snapshot.artifactPath,
      artifactAvailable: true,
      unavailableReason: null,
    };
  }

  if (actionableGapCount > 0) {
    return {
      verificationStatus: snapshot.verificationStatus,
      actionableGapCount,
      humanVerificationCount,
      routingDecision: 'continue-gaps',
      routingReason: `Structured verification reports ${actionableGapCount} actionable gap(s)`,
      artifactPath: snapshot.artifactPath,
      artifactAvailable: true,
      unavailableReason: null,
    };
  }

  if (snapshot.verificationStatus === 'human_needed' || humanVerificationCount > 0) {
    return {
      verificationStatus: snapshot.verificationStatus,
      actionableGapCount,
      humanVerificationCount,
      routingDecision: 'human-review',
      routingReason: `Structured verification reports ${humanVerificationCount} human verification item(s) and no actionable gaps`,
      artifactPath: snapshot.artifactPath,
      artifactAvailable: true,
      unavailableReason: null,
    };
  }

  return {
    verificationStatus: snapshot.verificationStatus,
    actionableGapCount,
    humanVerificationCount,
    routingDecision: 'review-hold',
    routingReason: `Structured verification status ${snapshot.verificationStatus} is not actionable`,
    artifactPath: snapshot.artifactPath,
    artifactAvailable: true,
    unavailableReason: null,
  };
}

export {
  deriveVerificationRouting,
  readLatestVerificationArtifact,
};
