// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { StatusCardSchema } from '../status-card'
import { ActionCardSchema } from '../action-card'
import { ApprovalCardSchema } from '../approval-card'
import { WorkflowCardSchema } from '../workflow-card'
import { FollowUpBlockSchema } from '../follow-up-block'

// ---------------------------------------------------------------------------
// StatusCardSchema
// ---------------------------------------------------------------------------

describe('StatusCardSchema', () => {
  it('accepts valid props', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'active',
      description: 'Running',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid props with optional fields', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'complete',
      description: 'Done',
      detail: 'All tasks finished',
      progress: 100,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required field: title', () => {
    const result = StatusCardSchema.safeParse({
      status: 'active',
      description: 'Running',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required field: status', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      description: 'Running',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status enum value', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'invalid',
      description: 'Running',
    })
    expect(result.success).toBe(false)
  })

  it('rejects progress outside range (>100)', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'active',
      description: 'Running',
      progress: 150,
    })
    expect(result.success).toBe(false)
  })

  it('rejects progress outside range (<0)', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'active',
      description: 'Running',
      progress: -10,
    })
    expect(result.success).toBe(false)
  })

  it('strips extra properties', () => {
    const result = StatusCardSchema.safeParse({
      title: 'Test',
      status: 'active',
      description: 'Running',
      extraProp: 'should be stripped',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).extraProp).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// ActionCardSchema
// ---------------------------------------------------------------------------

describe('ActionCardSchema', () => {
  it('accepts valid props', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [{ label: 'Go', actionType: 'approve' }],
    })
    expect(result.success).toBe(true)
  })

  it('applies default variant when not specified', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [{ label: 'Go', actionType: 'approve' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.actions[0].variant).toBe('secondary')
    }
  })

  it('rejects missing required field: actions', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty actions array (min 1)', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects actions array exceeding max 4', () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({
      label: `Action ${i}`,
      actionType: 'approve',
    }))
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions,
    })
    expect(result.success).toBe(false)
  })

  it('validates variant enum', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [{ label: 'Go', actionType: 'approve', variant: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('validates actionType enum', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [{ label: 'Go', actionType: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('strips extra properties', () => {
    const result = ActionCardSchema.safeParse({
      title: 'Action',
      description: 'Do something',
      actions: [{ label: 'Go', actionType: 'approve' }],
      extraProp: 'should be stripped',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).extraProp).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// ApprovalCardSchema
// ---------------------------------------------------------------------------

describe('ApprovalCardSchema', () => {
  it('accepts valid props', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      tier: 't1',
      command: 'echo hello',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid props with optional context', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      tier: 't2',
      command: 'deploy',
      context: { env: 'prod' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required field: tier', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      command: 'echo hello',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required field: command', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      tier: 't1',
    })
    expect(result.success).toBe(false)
  })

  it('validates tier enum', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      tier: 't4',
      command: 'echo hello',
    })
    expect(result.success).toBe(false)
  })

  it('strips extra properties', () => {
    const result = ApprovalCardSchema.safeParse({
      title: 'Approve',
      description: 'Review this',
      tier: 't1',
      command: 'echo hello',
      extraProp: 'should be stripped',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).extraProp).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// WorkflowCardSchema
// ---------------------------------------------------------------------------

describe('WorkflowCardSchema', () => {
  it('accepts valid props with minimal fields', () => {
    const result = WorkflowCardSchema.safeParse({
      title: 'Pipeline',
      workflowId: 'wf-1',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid props with all optional fields', () => {
    const result = WorkflowCardSchema.safeParse({
      title: 'Pipeline',
      workflowId: 'wf-1',
      nodeCount: 5,
      status: 'running',
      description: 'Processing data',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required field: title', () => {
    const result = WorkflowCardSchema.safeParse({
      workflowId: 'wf-1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required field: workflowId', () => {
    const result = WorkflowCardSchema.safeParse({
      title: 'Pipeline',
    })
    expect(result.success).toBe(false)
  })

  it('validates status enum', () => {
    const result = WorkflowCardSchema.safeParse({
      title: 'Pipeline',
      workflowId: 'wf-1',
      status: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('strips extra properties', () => {
    const result = WorkflowCardSchema.safeParse({
      title: 'Pipeline',
      workflowId: 'wf-1',
      extraProp: 'should be stripped',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).extraProp).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// FollowUpBlockSchema
// ---------------------------------------------------------------------------

describe('FollowUpBlockSchema', () => {
  it('accepts valid props', () => {
    const result = FollowUpBlockSchema.safeParse({
      suggestions: [{ label: 'Tell me more' }],
    })
    expect(result.success).toBe(true)
  })

  it('applies default actionType when not specified', () => {
    const result = FollowUpBlockSchema.safeParse({
      suggestions: [{ label: 'Tell me more' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestions[0].actionType).toBe('followup')
    }
  })

  it('rejects missing required field: suggestions', () => {
    const result = FollowUpBlockSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty suggestions array (min 1)', () => {
    const result = FollowUpBlockSchema.safeParse({ suggestions: [] })
    expect(result.success).toBe(false)
  })

  it('rejects suggestions array exceeding max 6', () => {
    const suggestions = Array.from({ length: 7 }, (_, i) => ({
      label: `Suggestion ${i}`,
    }))
    const result = FollowUpBlockSchema.safeParse({ suggestions })
    expect(result.success).toBe(false)
  })

  it('validates actionType enum', () => {
    const result = FollowUpBlockSchema.safeParse({
      suggestions: [{ label: 'Go', actionType: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid actionType values', () => {
    for (const actionType of ['followup', 'navigate', 'submit']) {
      const result = FollowUpBlockSchema.safeParse({
        suggestions: [{ label: 'Go', actionType }],
      })
      expect(result.success).toBe(true)
    }
  })

  it('strips extra properties', () => {
    const result = FollowUpBlockSchema.safeParse({
      suggestions: [{ label: 'Go' }],
      extraProp: 'should be stripped',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).extraProp).toBeUndefined()
    }
  })
})
