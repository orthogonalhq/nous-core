import { useMemo, useRef, useCallback, useState } from 'react'
import { trpc } from '../client'
import { useEventSubscription } from './useEventSubscription'

export interface UseWorkflowApiOptions {
  projectId?: string
}

/** Matches the WorkflowApiShape from spec (structural compatibility). */
interface WorkflowApiShape {
  /** Sets activeDefinitionId, enabling the reactive query. */
  loadSpec: (definitionId: string) => void
  saveSpec: (params: {
    projectId: string
    specYaml: string
    definitionId?: string
    name?: string
  }) => Promise<{ definitionId: string }>
  validateSpec: (specYaml: string) => Promise<{ valid: boolean; errors?: string[] }>
  /** Reactive data — auto-updates when SSE invalidates the tRPC query cache. */
  specYaml: string | null
  isLoading: boolean
  error: unknown
  activeDefinitionId: string | null
}

/**
 * Unified tRPC-backed workflow API hook.
 *
 * Provides `loadSpec`, `saveSpec`, and `validateSpec` operations backed by
 * tRPC mutations/queries. Subscribes to `workflow:spec-updated` SSE events
 * and invalidates the spec query cache on matching events, enabling reactive
 * re-projection in the builder.
 *
 * Follows the `useChatApi` ref pattern for stable references.
 */
export function useWorkflowApi(options?: UseWorkflowApiOptions): WorkflowApiShape {
  const projectId = options?.projectId
  const utils = trpc.useUtils()

  // Track current definitionId for SSE filtering
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null)

  // Reactive query — auto-refetches when cache is invalidated by SSE
  const specQuery = trpc.projects.getWorkflowDefinition.useQuery(
    { projectId: projectId!, definitionId: activeDefinitionId! },
    { enabled: !!projectId && !!activeDefinitionId },
  )

  // SSE subscription: invalidate spec query cache on workflow:spec-updated
  useEventSubscription({
    channels: ['workflow:spec-updated'],
    onEvent: (_channel, payload) => {
      const typed = payload as { projectId: string; definitionId: string }
      // Only invalidate if the event matches our active project
      if (projectId && typed.projectId === projectId) {
        void utils.projects.getWorkflowDefinition.invalidate({
          projectId,
          definitionId: typed.definitionId,
        })
      }
    },
    enabled: !!projectId,
  })

  // Mutation refs (stable references via ref pattern from useChatApi)
  const saveMutation = trpc.projects.saveWorkflowSpec.useMutation()
  const saveRef = useRef(saveMutation.mutateAsync)
  saveRef.current = saveMutation.mutateAsync

  const validateMutation = trpc.projects.validateWorkflowDefinition.useMutation()
  const validateRef = useRef(validateMutation.mutateAsync)
  validateRef.current = validateMutation.mutateAsync

  const loadSpec = useCallback((definitionId: string) => {
    setActiveDefinitionId(definitionId)
  }, [])

  const saveSpec = useCallback(async (params: {
    projectId: string
    specYaml: string
    definitionId?: string
    name?: string
  }) => {
    const result = await saveRef.current({
      projectId: params.projectId,
      specYaml: params.specYaml,
      definitionId: params.definitionId,
      name: params.name,
    })
    return { definitionId: result.definitionId }
  }, [])

  const validateSpec = useCallback(async (specYaml: string) => {
    if (!projectId) return { valid: false, errors: ['No project context'] }
    const result = await validateRef.current({
      projectId,
      workflowDefinition: specYaml,
    })
    return {
      valid: (result as Record<string, unknown>)?.valid === true,
      errors: Array.isArray((result as Record<string, unknown>)?.issues)
        ? ((result as Record<string, unknown>).issues as Array<{ message: string }>).map((i) => i.message)
        : undefined,
    }
  }, [projectId])

  return useMemo(
    () => ({
      loadSpec,
      saveSpec,
      validateSpec,
      specYaml: (specQuery.data as Record<string, unknown> | undefined)?.specYaml as string | null ?? null,
      isLoading: specQuery.isLoading,
      error: specQuery.error,
      activeDefinitionId,
    }),
    [loadSpec, saveSpec, validateSpec, specQuery.data, specQuery.isLoading, specQuery.error, activeDefinitionId],
  )
}
