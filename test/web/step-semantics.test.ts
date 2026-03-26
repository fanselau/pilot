import { describe, expect, it } from 'vitest'
import type { StepTimelineGroup } from '../../src/core/types.js'
import {
  deriveBranchIdentity,
  resolveSemanticHint,
  synthesizeHeaderFields,
} from '../../web/src/lib/step-semantics.js'

function makeUiReviewGroup(overrides: Partial<StepTimelineGroup> = {}): StepTimelineGroup {
  return {
    stepIndex: 4,
    command: 'ui-review',
    status: 'completed',
    source: 'delegation',
    sessionId: 'sess-ui-review',
    sections: [
      {
        sessionId: 'sess-ui-review',
        parentSessionId: null,
        title: 'project-ui-review-ab12-xy12',
        status: 'done',
        models: [],
        durationMs: 1200,
        depth: 0,
        items: [],
      },
    ],
    ...overrides,
  }
}

describe('resolveSemanticHint', () => {
  it('returns ui-review for ui-review runner titles', () => {
    expect(resolveSemanticHint('project-ui-review-ab12-xy12')).toBe('ui-review')
  })
})

describe('deriveBranchIdentity', () => {
  it('returns ui-review role for ui-review runner titles', () => {
    expect(deriveBranchIdentity('project-ui-review-ab12-xy12')).toMatchObject({
      role: 'ui-review',
      semanticHint: 'ui-review',
    })
  })
})

describe('synthesizeHeaderFields', () => {
  it('returns UI Review label and Design QA stage for ui-review groups', () => {
    expect(synthesizeHeaderFields(makeUiReviewGroup())).toMatchObject({
      label: 'UI Review',
      semanticType: 'ui-review',
      stage: 'Design QA',
    })
  })
})
