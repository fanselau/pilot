import type { BranchLifecycleItem } from '@pilot/core/types.js'

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export interface BranchIdentity {
  label: string
  role: string | null
  purpose: string | null
}

export function deriveBranchIdentity(title: string): BranchIdentity {
  const normalized = title.trim()
  if (!normalized) {
    return {
      label: 'Sub-agent branch',
      role: null,
      purpose: null,
    }
  }

  if (normalized.toLowerCase().startsWith('task:')) {
    const payload = normalized.slice(5).trim()
    const emDashIdx = payload.indexOf(' — ')
    const hyphenIdx = payload.indexOf(' - ')
    const splitIdx = [emDashIdx, hyphenIdx]
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b)[0] ?? -1

    const role = (splitIdx >= 0 ? payload.slice(0, splitIdx) : payload).trim() || null
    const purpose = splitIdx >= 0
      ? payload.slice(splitIdx + 3).trim() || null
      : null

    return {
      label: normalized,
      role,
      purpose,
    }
  }

  const colonIdx = normalized.indexOf(':')
  if (colonIdx > 0 && colonIdx < 28) {
    const maybeRole = normalized.slice(0, colonIdx).trim()
    const maybePurpose = normalized.slice(colonIdx + 1).trim()
    if (maybeRole && maybePurpose) {
      return {
        label: normalized,
        role: maybeRole,
        purpose: maybePurpose,
      }
    }
  }

  return {
    label: normalized,
    role: null,
    purpose: null,
  }
}

export function selectBranchPreview(item: BranchLifecycleItem): string | null {
  if (item.status === 'done' && isPresent(item.finalMessagePreview)) {
    return item.finalMessagePreview
  }

  if (isPresent(item.latestMessagePreview)) {
    return item.latestMessagePreview
  }

  if (isPresent(item.finalMessagePreview)) {
    return item.finalMessagePreview
  }

  return null
}

export function getBranchDrillInPath(jobId: string, sessionId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}/sessions/${encodeURIComponent(sessionId)}`
}
