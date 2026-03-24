import { resolveSemanticHint } from '~/lib/step-semantics'

export interface BranchIdentity {
  label: string
  role: string | null
  purpose: string | null
  /** Hint for which semantic type this branch likely represents. Derived from title patterns. Always non-null. */
  semanticHint: string
}

export function deriveBranchIdentity(title: string): BranchIdentity {
  const normalized = title.trim()
  if (!normalized) {
    return {
      label: 'Sub-agent',
      role: null,
      purpose: null,
      semanticHint: resolveSemanticHint(''),
    }
  }

  // Resolve semantic type from title — always non-null
  const semanticHint = resolveSemanticHint(normalized)

  // Pilot-generated session titles: pilot-delegate-{jobId}-{attempt}-{ts} / pilot-redelegate-{jobId}-{attempt}-{ts}
  const pilotMatch = normalized.match(/^pilot-(redelegate|delegate)-/)
  if (pilotMatch) {
    const agentRole = `pilot-${pilotMatch[1]}`
    return {
      label: agentRole,
      role: agentRole,
      purpose: normalized,
      semanticHint,
    }
  }

  // Runner command-step titles: {project}-{command}-{jobId}-{ts}
  // Extract the GSD command from known patterns
  const gsdCommandMatch = normalized.match(/-((?:add|plan|execute|verify|ui)-phase|judge|debugger|fast|quick|new-project|new-milestone|audit-milestone)-/)
  if (gsdCommandMatch) {
    return {
      label: gsdCommandMatch[1],
      role: gsdCommandMatch[1],
      purpose: normalized,
      semanticHint,
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
      semanticHint,
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
        semanticHint,
      }
    }
  }

  return {
    label: normalized,
    role: null,
    purpose: null,
    semanticHint,
  }
}

