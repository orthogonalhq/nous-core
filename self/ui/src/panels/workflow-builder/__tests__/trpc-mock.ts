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
      },
      deleteWorkflowDefinition: {
        useMutation: () => ({ mutateAsync: mockDeleteMutateAsync }),
      },
    },
    useUtils: () => ({
      projects: {
        getWorkflowDefinition: { fetch: mockFetch },
        listWorkflowDefinitions: { invalidate: vi.fn() },
      },
    }),
  },
}
