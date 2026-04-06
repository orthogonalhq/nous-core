// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { buildWorkflowsSection } from '../useWorkflows'

// ─── tRPC mock for useWorkflows hook ────────────────────────────────────────

const mockMutateAsync = vi.fn()
const mockInvalidate = vi.fn()

const mockRenameMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    projects: {
      listWorkflowDefinitions: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null }),
      },
      saveWorkflowSpec: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
      renameWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: mockRenameMutateAsync }),
      },
      deleteWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: mockDeleteMutateAsync }),
      },
    },
    useUtils: () => ({
      projects: {
        listWorkflowDefinitions: { invalidate: mockInvalidate },
      },
    }),
  },
}))

import { useWorkflows } from '../useWorkflows'
import type { UseWorkflowsReturn } from '../useWorkflows'

// --- buildWorkflowsSection tests (pure function, no React hooks needed) ---

describe('buildWorkflowsSection', () => {
  const mockNavigate = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an AssetSection with id "workflows" and label "WORKFLOWS"', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.id).toBe('workflows')
    expect(section.label).toBe('WORKFLOWS')
    expect(section.collapsible).toBe(true)
    expect(section.disabled).toBe(false)
  })

  it('returns empty items array when no workflows', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toEqual([])
  })

  it('maps workflows to items with workflow-detail::<id> routeIds', () => {
    const workflows = [
      { id: 'def-1', name: 'First Workflow' },
      { id: 'def-2', name: 'Second Workflow' },
    ]

    const section = buildWorkflowsSection({
      workflows,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toHaveLength(2)
    expect(section.items[0].id).toBe('def-1')
    expect(section.items[0].label).toBe('First Workflow')
    expect(section.items[0].routeId).toBe('workflow-detail::def-1')
    expect(section.items[1].id).toBe('def-2')
    expect(section.items[1].label).toBe('Second Workflow')
    expect(section.items[1].routeId).toBe('workflow-detail::def-2')
  })

  it('sets correct indicatorColor for workflow items', () => {
    const workflows = [{ id: 'def-1', name: 'Test Workflow' }]

    const section = buildWorkflowsSection({
      workflows,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items[0].indicatorColor).toBe('#4CAF50')
  })

  it('wires onAdd callback from params', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.onAdd).toBe(mockOnAdd)
    section.onAdd!()
    expect(mockOnAdd).toHaveBeenCalledOnce()
  })

  it('section is collapsible and not disabled', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.collapsible).toBe(true)
    expect(section.disabled).toBe(false)
  })
})

// --- createWorkflow tests (React hook, needs renderHook) ---

describe('useWorkflows — createWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('UseWorkflowsReturn includes createWorkflow', () => {
    // Type-level assertion — if this compiles, the interface is correct
    const _check: UseWorkflowsReturn['createWorkflow'] extends (projectId: string) => Promise<string | null> ? true : never = true
    expect(_check).toBe(true)
  })

  it('calls saveWorkflowSpec and returns definitionId', async () => {
    mockMutateAsync.mockResolvedValueOnce({ definitionId: 'new-def-123' })

    const { result } = renderHook(() => useWorkflows({ projectId: 'proj-1' }))

    let returnedId: string | null = null
    await act(async () => {
      returnedId = await result.current.createWorkflow('proj-1')
    })

    expect(returnedId).toBe('new-def-123')
    expect(mockMutateAsync).toHaveBeenCalledOnce()
    expect(mockMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      specYaml: expect.stringContaining('name: Untitled Workflow'),
    })
    // Verify the YAML includes a nous.agent.claude node
    const calledYaml = mockMutateAsync.mock.calls[0][0].specYaml as string
    expect(calledYaml).toContain('type: nous.agent.claude')
    expect(calledYaml).toContain('nodes:')
    expect(calledYaml).toContain('connections: []')

    // Verify invalidation was called
    expect(mockInvalidate).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('returns null on mutation error', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Save failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useWorkflows({ projectId: 'proj-1' }))

    let returnedId: string | null = 'not-null'
    await act(async () => {
      returnedId = await result.current.createWorkflow('proj-1')
    })

    expect(returnedId).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useWorkflows] createWorkflow failed:',
      expect.any(Error),
    )
    // Invalidation should NOT be called on error
    expect(mockInvalidate).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

// --- renameWorkflow tests ---

describe('useWorkflows — renameWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('UseWorkflowsReturn includes renameWorkflow', () => {
    // Type-level assertion — if this compiles, the interface is correct
    const _check: UseWorkflowsReturn['renameWorkflow'] extends (definitionId: string, name: string) => Promise<void> ? true : never = true
    expect(_check).toBe(true)
  })

  it('calls mutation and invalidates query', async () => {
    mockRenameMutateAsync.mockResolvedValueOnce({ renamed: true })

    const { result } = renderHook(() => useWorkflows({ projectId: 'proj-1' }))

    await act(async () => {
      await result.current.renameWorkflow('def-123', 'New Name')
    })

    expect(mockRenameMutateAsync).toHaveBeenCalledOnce()
    expect(mockRenameMutateAsync).toHaveBeenCalledWith({
      projectId: 'proj-1',
      definitionId: 'def-123',
      name: 'New Name',
    })
    expect(mockInvalidate).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('handles error gracefully', async () => {
    mockRenameMutateAsync.mockRejectedValueOnce(new Error('Rename failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useWorkflows({ projectId: 'proj-1' }))

    await act(async () => {
      await result.current.renameWorkflow('def-123', 'New Name')
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[useWorkflows] renameWorkflow failed:',
      expect.any(Error),
    )
    // Invalidation should NOT be called on error
    expect(mockInvalidate).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
