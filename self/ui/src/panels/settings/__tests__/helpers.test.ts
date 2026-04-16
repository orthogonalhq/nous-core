// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  testStoredProviderKey,
  formatFeedbackError,
  buildModelsByProvider,
} from '../pages/helpers'
import type {
  PreferencesApi,
  AvailableModel,
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
