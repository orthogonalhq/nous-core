import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkflowApi } from '../useWorkflowApi'

// ─── Mock tRPC client ──────────────────────────────────────────────────────────

const mockSaveMutateAsync = vi.fn()
const mockValidateMutateAsync = vi.fn()
const mockInvalidate = vi.fn()

let onEventCallback: ((channel: string, payload: unknown) => void) | undefined

vi.mock('../../client', () => ({
  trpc: {
    useUtils: () => ({
      projects: {
        getWorkflowDefinition: {
          invalidate: mockInvalidate,
        },
      },
    }),
    projects: {
      getWorkflowDefinition: {
        useQuery: (_args: unknown, _opts: unknown) => ({
          data: null,
          isLoading: false,
          error: null,
        }),
      },
      saveWorkflowSpec: {
        useMutation: () => ({ mutateAsync: mockSaveMutateAsync }),
      },
      validateWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: mockValidateMutateAsync }),
      },
    },
  },
}))

vi.mock('../useEventSubscription', () => ({
  useEventSubscription: (opts: { channels: string[]; onEvent: (channel: string, payload: unknown) => void; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      onEventCallback = opts.onEvent
    } else {
      onEventCallback = undefined
    }
  },
}))

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useWorkflowApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onEventCallback = undefined
  })

  // ── Tier 1: Contract ────────────────────────────────────────────────────

  it('returned object has expected API surface', () => {
    const { result } = renderHook(() => useWorkflowApi())
    expect(typeof result.current.loadSpec).toBe('function')
    expect(typeof result.current.saveSpec).toBe('function')
    expect(typeof result.current.validateSpec).toBe('function')
    expect(result.current).toHaveProperty('specYaml')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('activeDefinitionId')
  })

  it('activeDefinitionId is null initially', () => {
    const { result } = renderHook(() => useWorkflowApi())
    expect(result.current.activeDefinitionId).toBeNull()
  })

  it('specYaml is null when no activeDefinitionId', () => {
    const { result } = renderHook(() => useWorkflowApi())
    expect(result.current.specYaml).toBeNull()
  })

  // ── Tier 2: Behavior ───────────────────────────────────────────────────

  it('loadSpec sets activeDefinitionId', () => {
    const { result } = renderHook(() => useWorkflowApi({ projectId: 'proj-1' }))

    act(() => {
      result.current.loadSpec('def-123')
    })

    expect(result.current.activeDefinitionId).toBe('def-123')
  })

  it('saveSpec calls tRPC mutation and returns definitionId', async () => {
    mockSaveMutateAsync.mockResolvedValueOnce({ definitionId: 'new-def-1' })

    const { result } = renderHook(() => useWorkflowApi({ projectId: 'proj-1' }))
    const saveResult = await result.current.saveSpec({
      projectId: 'proj-1',
      specYaml: 'name: test\nversion: 1\nnodes: []\nconnections: []',
    })

    expect(mockSaveMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      specYaml: 'name: test\nversion: 1\nnodes: []\nconnections: []',
      definitionId: undefined,
      name: undefined,
    })
    expect(saveResult).toEqual({ definitionId: 'new-def-1' })
  })

  it('validateSpec calls tRPC mutation and returns result', async () => {
    mockValidateMutateAsync.mockResolvedValueOnce({
      valid: true,
      issues: [],
    })

    const { result } = renderHook(() => useWorkflowApi({ projectId: 'proj-1' }))
    const validateResult = await result.current.validateSpec('name: test')

    expect(mockValidateMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      workflowDefinition: 'name: test',
    })
    expect(validateResult.valid).toBe(true)
  })

  it('validateSpec returns invalid when no projectId', async () => {
    const { result } = renderHook(() => useWorkflowApi())
    const validateResult = await result.current.validateSpec('name: test')

    expect(validateResult.valid).toBe(false)
    expect(validateResult.errors).toContain('No project context')
  })

  // ── SSE integration ───────────────────────────────────────────────────

  it('SSE event matching projectId triggers cache invalidation', () => {
    renderHook(() => useWorkflowApi({ projectId: 'proj-1' }))

    expect(onEventCallback).toBeDefined()
    onEventCallback?.('workflow:spec-updated', {
      projectId: 'proj-1',
      definitionId: 'def-1',
    })

    expect(mockInvalidate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      definitionId: 'def-1',
    })
  })

  it('SSE event not matching projectId is ignored', () => {
    renderHook(() => useWorkflowApi({ projectId: 'proj-1' }))

    expect(onEventCallback).toBeDefined()
    onEventCallback?.('workflow:spec-updated', {
      projectId: 'proj-OTHER',
      definitionId: 'def-1',
    })

    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('SSE subscription is disabled when no projectId', () => {
    renderHook(() => useWorkflowApi())
    // onEventCallback should not be set when enabled is false
    expect(onEventCallback).toBeUndefined()
  })
})
