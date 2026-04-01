/**
 * Reusable @nous/transport mock for workflow builder tests.
 *
 * Usage: Add `vi.mock('@nous/transport', () => trpcMock)` at the top of test files
 * (before imports), alongside the existing reactFlowMock pattern.
 */
import { vi } from 'vitest'

export const mockMutateAsync = vi.fn()
export const mockFetch = vi.fn().mockResolvedValue({ specYaml: undefined })

export const trpcMock = {
  trpc: {
    projects: {
      saveWorkflowSpec: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
      listWorkflowDefinitions: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
      },
      getWorkflowDefinition: {
        query: mockFetch,
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
