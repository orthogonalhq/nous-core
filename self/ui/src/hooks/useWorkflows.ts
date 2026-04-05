'use client'

import { useCallback } from 'react'
import { trpc } from '@nous/transport'
import type { AssetSection } from '../components/shell/types'

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseWorkflowsOptions {
  projectId: string | null
}

export interface UseWorkflowsReturn {
  workflows: Array<{ id: string; name: string }>
  workflowsLoading: boolean
  workflowsError: unknown
  createWorkflow: (projectId: string) => Promise<string | null>
}

export function useWorkflows({ projectId }: UseWorkflowsOptions): UseWorkflowsReturn {
  const { data, isLoading, error } = trpc.projects.listWorkflowDefinitions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  )

  const saveSpecMutation = trpc.projects.saveWorkflowSpec.useMutation()
  const utils = trpc.useUtils()

  const createWorkflow = useCallback(async (targetProjectId: string): Promise<string | null> => {
    const minimalSpecYaml = [
      'name: Untitled Workflow',
      'version: 1',
      'nodes:',
      '  - id: start',
      '    name: Start',
      '    type: nous.agent.claude',
      '    position: [250, 200]',
      '    parameters: {}',
      'connections: []',
    ].join('\n')

    try {
      const result = await saveSpecMutation.mutateAsync({
        projectId: targetProjectId,
        specYaml: minimalSpecYaml,
      })
      void utils.projects.listWorkflowDefinitions.invalidate({ projectId: targetProjectId })
      return result.definitionId
    } catch (error) {
      console.error('[useWorkflows] createWorkflow failed:', error)
      return null
    }
  }, [saveSpecMutation, utils])

  return {
    workflows: data ?? [],
    workflowsLoading: isLoading,
    workflowsError: error,
    createWorkflow,
  }
}

// ─── buildWorkflowsSection helper ────────────────────────────────────────────

export function buildWorkflowsSection(params: {
  workflows: Array<{ id: string; name: string }>
  loading: boolean
  error: unknown
  onAdd: () => void
  navigate: (routeId: string, navParams?: Record<string, unknown>) => void
}): AssetSection {
  return {
    id: 'workflows',
    label: 'WORKFLOWS',
    items: params.workflows.map((wf) => ({
      id: wf.id,
      label: wf.name,
      indicatorColor: '#4CAF50',
      routeId: `workflow-detail::${wf.id}`,
    })),
    collapsible: true,
    disabled: false,
    onAdd: params.onAdd,
  }
}
