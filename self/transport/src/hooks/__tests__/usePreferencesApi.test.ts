import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePreferencesApi } from '../usePreferencesApi'

// ─── Mock tRPC client ──────────────────────────────────────────────────────────

const mockFetch = {
  getApiKeys: vi.fn(),
  getAvailableModels: vi.fn(),
  getModelSelection: vi.fn(),
  getRoleAssignments: vi.fn(),
  getSystemStatus: vi.fn(),
  listOllamaModels: vi.fn(),
}

const mockMutateAsync = {
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  testApiKey: vi.fn(),
  setModelSelection: vi.fn(),
  setRoleAssignment: vi.fn(),
  resetWizard: vi.fn(),
  pullOllamaModel: vi.fn(),
  deleteOllamaModel: vi.fn(),
}

vi.mock('../../client', () => ({
  trpc: {
    useUtils: () => ({
      preferences: {
        getApiKeys: { fetch: mockFetch.getApiKeys },
        getAvailableModels: { fetch: mockFetch.getAvailableModels },
        getModelSelection: { fetch: mockFetch.getModelSelection },
        getRoleAssignments: { fetch: mockFetch.getRoleAssignments },
        getSystemStatus: { fetch: mockFetch.getSystemStatus },
      },
      ollama: {
        listModels: { fetch: mockFetch.listOllamaModels },
      },
    }),
    preferences: {
      setApiKey: { useMutation: () => ({ mutateAsync: mockMutateAsync.setApiKey }) },
      deleteApiKey: { useMutation: () => ({ mutateAsync: mockMutateAsync.deleteApiKey }) },
      testApiKey: { useMutation: () => ({ mutateAsync: mockMutateAsync.testApiKey }) },
      setModelSelection: { useMutation: () => ({ mutateAsync: mockMutateAsync.setModelSelection }) },
      setRoleAssignment: { useMutation: () => ({ mutateAsync: mockMutateAsync.setRoleAssignment }) },
    },
    firstRun: {
      resetWizard: { useMutation: () => ({ mutateAsync: mockMutateAsync.resetWizard }) },
    },
    ollama: {
      pullModel: { useMutation: () => ({ mutateAsync: mockMutateAsync.pullOllamaModel }) },
      deleteModel: { useMutation: () => ({ mutateAsync: mockMutateAsync.deleteOllamaModel }) },
    },
  },
}))

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('usePreferencesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Tier 1: Contract Tests ───────────────────────────────────────────────

  describe('contract', () => {
    it('returned object has all required methods', () => {
      const { result } = renderHook(() => usePreferencesApi())
      const api = result.current

      expect(typeof api.getApiKeys).toBe('function')
      expect(typeof api.setApiKey).toBe('function')
      expect(typeof api.deleteApiKey).toBe('function')
      expect(typeof api.testApiKey).toBe('function')
      expect(typeof api.getSystemStatus).toBe('function')
    })

    it('returned object has all optional methods', () => {
      const { result } = renderHook(() => usePreferencesApi())
      const api = result.current

      expect(typeof api.getAvailableModels).toBe('function')
      expect(typeof api.getModelSelection).toBe('function')
      expect(typeof api.setModelSelection).toBe('function')
      expect(typeof api.getRoleAssignments).toBe('function')
      expect(typeof api.setRoleAssignment).toBe('function')
      expect(typeof api.resetWizard).toBe('function')
      expect(typeof api.listOllamaModels).toBe('function')
      expect(typeof api.pullOllamaModel).toBe('function')
      expect(typeof api.deleteOllamaModel).toBe('function')
    })

    it('returned object is referentially stable across re-renders', () => {
      const { result, rerender } = renderHook(() => usePreferencesApi())
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })
  })

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  describe('query delegation', () => {
    it('getApiKeys calls utils.preferences.getApiKeys.fetch', async () => {
      const mockData = [{ provider: 'openai', configured: true, maskedKey: 'sk-***', createdAt: null }]
      mockFetch.getApiKeys.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getApiKeys()

      expect(mockFetch.getApiKeys).toHaveBeenCalledOnce()
      expect(data).toEqual(mockData)
    })

    it('getSystemStatus calls utils.preferences.getSystemStatus.fetch', async () => {
      const mockData = { ollama: { running: false, models: [] }, configuredProviders: [], credentialVaultHealthy: true }
      mockFetch.getSystemStatus.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getSystemStatus()

      expect(mockFetch.getSystemStatus).toHaveBeenCalledOnce()
      expect(data).toEqual(mockData)
    })

    it('getAvailableModels calls utils.preferences.getAvailableModels.fetch', async () => {
      const mockData = { models: [{ id: 'm1', name: 'Model 1', provider: 'openai', available: true }] }
      mockFetch.getAvailableModels.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getAvailableModels()

      expect(mockFetch.getAvailableModels).toHaveBeenCalledOnce()
      expect(data).toEqual(mockData)
    })

    it('getModelSelection calls utils.preferences.getModelSelection.fetch', async () => {
      const mockData = { principal: 'openai:gpt-4', system: null }
      mockFetch.getModelSelection.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getModelSelection()

      expect(mockFetch.getModelSelection).toHaveBeenCalledOnce()
      expect(data).toEqual(mockData)
    })
  })

  describe('mutation delegation', () => {
    it('setApiKey calls mutation.mutateAsync with input', async () => {
      const input = { provider: 'openai', key: 'sk-test' }
      mockMutateAsync.setApiKey.mockResolvedValueOnce({ stored: true })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.setApiKey(input)

      expect(mockMutateAsync.setApiKey).toHaveBeenCalledWith(input)
      expect(data).toEqual({ stored: true })
    })

    it('deleteApiKey calls mutation.mutateAsync with input', async () => {
      const input = { provider: 'openai' }
      mockMutateAsync.deleteApiKey.mockResolvedValueOnce({ deleted: true })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.deleteApiKey(input)

      expect(mockMutateAsync.deleteApiKey).toHaveBeenCalledWith(input)
      expect(data).toEqual({ deleted: true })
    })

    it('testApiKey calls mutation.mutateAsync with input', async () => {
      const input = { provider: 'openai', key: 'sk-test' }
      mockMutateAsync.testApiKey.mockResolvedValueOnce({ valid: true, error: null })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.testApiKey(input)

      expect(mockMutateAsync.testApiKey).toHaveBeenCalledWith(input)
      expect(data).toEqual({ valid: true, error: null })
    })

    it('setModelSelection calls mutation.mutateAsync with input', async () => {
      const input = { principal: 'openai:gpt-4' }
      mockMutateAsync.setModelSelection.mockResolvedValueOnce({ success: true })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.setModelSelection(input)

      expect(mockMutateAsync.setModelSelection).toHaveBeenCalledWith(input)
      expect(data).toEqual({ success: true })
    })

    it('setRoleAssignment calls mutation.mutateAsync with input', async () => {
      const input = { role: 'orchestrator', modelSpec: 'openai:gpt-4' }
      mockMutateAsync.setRoleAssignment.mockResolvedValueOnce({ success: true })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.setRoleAssignment(input)

      expect(mockMutateAsync.setRoleAssignment).toHaveBeenCalledWith(input)
      expect(data).toEqual({ success: true })
    })
  })

  // ── Tier 3: Adapter Tests ───────────────────────────────────────────────

  describe('getRoleAssignments adapter', () => {
    it('transforms Record to array', async () => {
      mockFetch.getRoleAssignments.mockResolvedValueOnce({
        orchestrator: { providerId: 'openai:gpt-4' },
        reasoner: null,
      })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getRoleAssignments()

      expect(data).toEqual([
        { role: 'orchestrator', providerId: 'openai:gpt-4' },
        { role: 'reasoner', providerId: null },
      ])
    })

    it('drops fallbackProviderId', async () => {
      mockFetch.getRoleAssignments.mockResolvedValueOnce({
        orchestrator: { providerId: 'openai:gpt-4', fallbackProviderId: 'anthropic:claude' },
      })

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getRoleAssignments()

      expect(data).toEqual([
        { role: 'orchestrator', providerId: 'openai:gpt-4' },
      ])
      // Verify no fallbackProviderId key
      expect(data[0]).not.toHaveProperty('fallbackProviderId')
    })

    it('handles empty record', async () => {
      mockFetch.getRoleAssignments.mockResolvedValueOnce({})

      const { result } = renderHook(() => usePreferencesApi())
      const data = await result.current.getRoleAssignments()

      expect(data).toEqual([])
    })
  })
})
