// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  testStoredProviderKey,
  formatFeedbackError,
  isModelRole,
  buildEmptyRoleAssignments,
  buildPendingRoleAssignments,
  normalizeRoleAssignmentEntries,
  buildModelsByProvider,
  getModelOptionLabel,
  getRoleAssignmentDisplay,
  buildChangedRoleAssignments,
} from '../pages/helpers'
import { MODEL_ROLES } from '../types'
import type {
  PreferencesApi,
  AvailableModel,
  HydratedRoleAssignmentDisplayEntry,
  RoleAssignmentState,
  PendingRoleAssignments,
} from '../types'

describe('testStoredProviderKey', () => {
  it('returns success FeedbackState when key is valid', async () => {
    const api = {
      testApiKey: vi.fn().mockResolvedValue({ valid: true, error: null }),
    } as unknown as PreferencesApi
    const result = await testStoredProviderKey(api, 'anthropic')
    expect(result.success).toBe(true)
    expect(result.message).toContain('Anthropic')
    expect(result.message).toContain('valid')
  })

  it('returns failure FeedbackState when key is invalid', async () => {
    const api = {
      testApiKey: vi.fn().mockResolvedValue({ valid: false, error: 'bad key' }),
    } as unknown as PreferencesApi
    const result = await testStoredProviderKey(api, 'openai')
    expect(result.success).toBe(false)
    expect(result.message).toBe('bad key')
  })

  it('returns failure with default message when error is null', async () => {
    const api = {
      testApiKey: vi.fn().mockResolvedValue({ valid: false, error: null }),
    } as unknown as PreferencesApi
    const result = await testStoredProviderKey(api, 'anthropic')
    expect(result.success).toBe(false)
    expect(result.message).toContain('test failed')
  })

  it('propagates error when api.testApiKey throws', async () => {
    const api = {
      testApiKey: vi.fn().mockRejectedValue(new Error('network error')),
    } as unknown as PreferencesApi
    await expect(testStoredProviderKey(api, 'anthropic')).rejects.toThrow('network error')
  })
})

describe('formatFeedbackError', () => {
  it('formats Error objects', () => {
    const result = formatFeedbackError(new Error('something broke'))
    expect(result.success).toBe(false)
    expect(result.message).toBe('Error: something broke')
  })

  it('formats non-Error values', () => {
    const result = formatFeedbackError('a string error')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Error: a string error')
  })
})

describe('isModelRole', () => {
  it('returns true for all 7 valid roles', () => {
    for (const role of MODEL_ROLES) {
      expect(isModelRole(role)).toBe(true)
    }
  })

  it('returns false for invalid strings', () => {
    expect(isModelRole('invalid-role')).toBe(false)
    expect(isModelRole('')).toBe(false)
    expect(isModelRole('orchestrators')).toBe(false)
  })
})

describe('buildEmptyRoleAssignments', () => {
  it('returns object with all 7 MODEL_ROLES keys', () => {
    const result = buildEmptyRoleAssignments()
    for (const role of MODEL_ROLES) {
      expect(result[role]).toBeDefined()
      expect(result[role].role).toBe(role)
      expect(result[role].providerId).toBeNull()
      expect(result[role].displayName).toBeNull()
      expect(result[role].modelSpec).toBeNull()
    }
  })
})

describe('buildPendingRoleAssignments', () => {
  it('extracts modelSpec for each role', () => {
    const state = buildEmptyRoleAssignments()
    state.orchestrator.modelSpec = 'claude-opus'
    state.reasoner.modelSpec = 'gpt-4'

    const result = buildPendingRoleAssignments(state)
    expect(result.orchestrator).toBe('claude-opus')
    expect(result.reasoner).toBe('gpt-4')
    expect(result.summarizer).toBe('')
  })
})

describe('normalizeRoleAssignmentEntries', () => {
  it('maps display entries to RoleAssignmentState', () => {
    const entries = [
      { role: 'orchestrator', providerId: 'anthropic', displayName: 'Claude', modelSpec: 'claude-3' },
      { role: 'reasoner', providerId: 'openai', displayName: 'GPT', modelSpec: 'gpt-4' },
    ]
    const result = normalizeRoleAssignmentEntries(entries)
    expect(result.orchestrator.modelSpec).toBe('claude-3')
    expect(result.reasoner.providerId).toBe('openai')
    expect(result.summarizer.providerId).toBeNull()
  })

  it('skips entries with unknown roles', () => {
    const entries = [
      { role: 'unknown-role', providerId: 'test' },
      { role: 'orchestrator', providerId: 'anthropic' },
    ]
    const result = normalizeRoleAssignmentEntries(entries)
    expect(result.orchestrator.providerId).toBe('anthropic')
    expect((result as Record<string, unknown>)['unknown-role']).toBeUndefined()
  })

  it('handles empty array input', () => {
    const result = normalizeRoleAssignmentEntries([])
    for (const role of MODEL_ROLES) {
      expect(result[role].providerId).toBeNull()
    }
  })
})

describe('buildModelsByProvider', () => {
  it('groups models by provider', () => {
    const models: AvailableModel[] = [
      { id: 'c1', name: 'Claude 1', provider: 'anthropic', available: true },
      { id: 'c2', name: 'Claude 2', provider: 'anthropic', available: true },
      { id: 'g1', name: 'GPT 1', provider: 'openai', available: true },
    ]
    const result = buildModelsByProvider(models)
    expect(result.anthropic).toHaveLength(2)
    expect(result.openai).toHaveLength(1)
  })

  it('returns empty object for empty array', () => {
    expect(buildModelsByProvider([])).toEqual({})
  })
})

describe('getModelOptionLabel', () => {
  it('returns name for available models', () => {
    expect(getModelOptionLabel({ id: '1', name: 'Claude', provider: 'a', available: true })).toBe('Claude')
  })

  it('appends (cached) for unavailable models', () => {
    expect(getModelOptionLabel({ id: '1', name: 'Claude', provider: 'a', available: false })).toBe('Claude (cached)')
  })
})

describe('getRoleAssignmentDisplay', () => {
  const models: AvailableModel[] = [
    { id: 'claude-3', name: 'Claude 3 Opus', provider: 'anthropic', available: true },
  ]

  it('returns matching model name when modelSpec matches', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: 'anthropic', modelSpec: 'claude-3',
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('Claude 3 Opus')
  })

  it('falls back to displayName when modelSpec has no matching model', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: 'anthropic', modelSpec: 'unknown-id', displayName: 'Custom Model',
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('Custom Model')
  })

  it('falls back to modelSpec string when no model match and no displayName', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: 'anthropic', modelSpec: 'unknown-id',
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('unknown-id')
  })

  it('returns displayName when no modelSpec', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: null, displayName: 'A display name',
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('A display name')
  })

  it('returns providerId when no modelSpec and no displayName', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: 'anthropic',
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('anthropic')
  })

  it('returns "Not assigned" when nothing available', () => {
    const entry: HydratedRoleAssignmentDisplayEntry = {
      role: 'orchestrator', providerId: null,
    }
    expect(getRoleAssignmentDisplay(entry, models)).toBe('Not assigned')
  })
})

describe('buildChangedRoleAssignments', () => {
  it('returns only changed entries', () => {
    const state = buildEmptyRoleAssignments()
    state.orchestrator.modelSpec = 'claude-3'
    const pending: PendingRoleAssignments = {
      orchestrator: 'gpt-4',
      reasoner: '',
      'tool-advisor': '',
      summarizer: '',
      embedder: '',
      reranker: '',
      vision: '',
    }
    const result = buildChangedRoleAssignments(state, pending)
    expect(result).toHaveLength(1)
    expect(result[0]!.role).toBe('orchestrator')
    expect(result[0]!.modelSpec).toBe('gpt-4')
  })

  it('returns empty array when no roles changed', () => {
    const state = buildEmptyRoleAssignments()
    const pending = buildPendingRoleAssignments(state)
    const result = buildChangedRoleAssignments(state, pending)
    expect(result).toHaveLength(0)
  })

  it('ignores pending values that are empty strings', () => {
    const state = buildEmptyRoleAssignments()
    state.orchestrator.modelSpec = 'claude-3'
    const pending = buildPendingRoleAssignments(state)
    pending.orchestrator = ''
    const result = buildChangedRoleAssignments(state, pending)
    expect(result).toHaveLength(0)
  })
})
