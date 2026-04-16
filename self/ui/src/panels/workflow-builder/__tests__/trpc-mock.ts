/**
 * Reusable @nous/transport mock for workflow builder tests.
 *
 * Usage: Add `vi.mock('@nous/transport', () => trpcMock)` at the top of test files
 * (before imports), alongside the existing reactFlowMock pattern.
 */
import { vi } from 'vitest'

export const mockMutateAsync = vi.fn()
export const mockDeleteMutateAsync = vi.fn()
export const mockFetch = vi.fn().mockResolvedValue({ specYaml: undefined })

/** Configurable return value for listWorkflowDefinitions.useQuery. */
export const mockListWorkflowDefinitionsResult = {
  data: [] as Array<{ id: string; name: string; version: number; isDefault?: boolean }>,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}

/** Configurable return value for workflowSnapshot.useQuery. */
export const mockWorkflowSnapshotResult = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
}

/** Mock for useEventSubscription — tracks calls for assertion. */
export const mockUseEventSubscription = vi.fn()

/** Mock return value for useWorkflowApi. */
export const mockWorkflowApi = {
  loadSpec: vi.fn(),
  saveSpec: vi.fn().mockResolvedValue({ definitionId: 'mock-def-id' }),
  validateSpec: vi.fn().mockResolvedValue({ valid: true }),
  specYaml: null as string | null,
  isLoading: false,
  error: null,
  activeDefinitionId: null as string | null,
}

export const trpcMock = {
  trpc: {
    projects: {
      saveWorkflowSpec: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
      listWorkflowDefinitions: {
        useQuery: vi.fn().mockImplementation(() => mockListWorkflowDefinitionsResult),
      },
      getWorkflowDefinition: {
        query: mockFetch,
        useQuery: vi.fn().mockImplementation(() => ({ data: null, isLoading: false, error: null })),
      },
      deleteWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: mockDeleteMutateAsync }),
      },
      validateWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ valid: true, issues: [] }) }),
      },
      workflowSnapshot: {
        useQuery: vi.fn().mockImplementation(() => mockWorkflowSnapshotResult),
      },
    },
    useUtils: () => ({
      projects: {
        getWorkflowDefinition: { fetch: mockFetch, invalidate: vi.fn() },
        listWorkflowDefinitions: { invalidate: vi.fn() },
        workflowSnapshot: { invalidate: vi.fn() },
      },
    }),
  },
  useEventSubscription: mockUseEventSubscription,
  useWorkflowApi: vi.fn().mockImplementation(() => mockWorkflowApi),
}
