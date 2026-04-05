'use client'

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
}

export function useWorkflows({ projectId }: UseWorkflowsOptions): UseWorkflowsReturn {
  const { data, isLoading, error } = trpc.projects.listWorkflowDefinitions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  )

  return {
    workflows: data ?? [],
    workflowsLoading: isLoading,
    workflowsError: error,
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
