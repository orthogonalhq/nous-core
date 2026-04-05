'use client'

import { useMemo, useRef, useCallback, useState } from 'react'
import { trpc } from '@nous/transport'
import type { TaskDefinition, TaskCreateInput, TaskUpdateInput, TaskExecutionRecord } from '@nous/shared'
import type { AssetSection } from '../components/shell/types'

// ─── Hook Types ───────────────────────────────────────────────────────────────

export interface UseTasksOptions {
  projectId: string | null
}

export interface UseTasksReturn {
  // --- Queries ---
  tasks: TaskDefinition[]
  tasksLoading: boolean
  tasksError: unknown

  activeTask: TaskDefinition | null
  activeTaskLoading: boolean
  activeTaskError: unknown
  loadTask: (taskId: string) => void

  executions: TaskExecutionRecord[]
  executionsLoading: boolean
  executionsError: unknown
  loadExecutions: (taskId: string) => void

  // --- Mutations ---
  createTask: (input: TaskCreateInput) => Promise<TaskDefinition>
  updateTask: (taskId: string, updates: TaskUpdateInput) => Promise<TaskDefinition>
  deleteTask: (taskId: string) => Promise<{ deleted: boolean }>
  toggleTask: (taskId: string) => Promise<TaskDefinition>
  triggerTask: (taskId: string) => Promise<{ executionId: string; runId: string }>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTasks(options: UseTasksOptions): UseTasksReturn {
  const { projectId } = options
  const utils = trpc.useUtils()

  // Internal state for gated queries
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeExecutionTaskId, setActiveExecutionTaskId] = useState<string | null>(null)

  // --- Queries ---

  const listQuery = trpc.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  )

  const getQuery = trpc.tasks.get.useQuery(
    { projectId: projectId!, taskId: activeTaskId! },
    { enabled: !!projectId && !!activeTaskId },
  )

  const executionsQuery = trpc.tasks.executions.useQuery(
    { projectId: projectId!, taskId: activeExecutionTaskId!, limit: 20 },
    { enabled: !!projectId && !!activeExecutionTaskId },
  )

  // No render-time logging — causes console spam on every re-render.

  // --- Mutations (stable refs) ---

  const createMutation = trpc.tasks.create.useMutation()
  const createRef = useRef(createMutation.mutateAsync)
  createRef.current = createMutation.mutateAsync

  const updateMutation = trpc.tasks.update.useMutation()
  const updateRef = useRef(updateMutation.mutateAsync)
  updateRef.current = updateMutation.mutateAsync

  const deleteMutation = trpc.tasks.delete.useMutation()
  const deleteRef = useRef(deleteMutation.mutateAsync)
  deleteRef.current = deleteMutation.mutateAsync

  const toggleMutation = trpc.tasks.toggle.useMutation()
  const toggleRef = useRef(toggleMutation.mutateAsync)
  toggleRef.current = toggleMutation.mutateAsync

  const triggerMutation = trpc.tasks.trigger.useMutation()
  const triggerRef = useRef(triggerMutation.mutateAsync)
  triggerRef.current = triggerMutation.mutateAsync

  // --- Callbacks ---

  const loadTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId)
  }, [])

  const loadExecutions = useCallback((taskId: string) => {
    setActiveExecutionTaskId(taskId)
  }, [])

  const createTask = useCallback(async (input: TaskCreateInput) => {
    if (!projectId) throw new Error('No project context')
    const result = await createRef.current({ projectId, task: input })
    await utils.tasks.list.invalidate({ projectId })
    return result
  }, [projectId, utils])

  const updateTask = useCallback(async (taskId: string, updates: TaskUpdateInput) => {
    if (!projectId) throw new Error('No project context')
    const result = await updateRef.current({ projectId, taskId, updates })
    await utils.tasks.list.invalidate({ projectId })
    await utils.tasks.get.invalidate({ projectId, taskId })
    return result
  }, [projectId, utils])

  const deleteTask = useCallback(async (taskId: string) => {
    if (!projectId) throw new Error('No project context')
    const result = await deleteRef.current({ projectId, taskId })
    await utils.tasks.list.invalidate({ projectId })
    return result
  }, [projectId, utils])

  const toggleTask = useCallback(async (taskId: string) => {
    if (!projectId) throw new Error('No project context')
    const result = await toggleRef.current({ projectId, taskId })
    await utils.tasks.list.invalidate({ projectId })
    await utils.tasks.get.invalidate({ projectId, taskId })
    return result
  }, [projectId, utils])

  const triggerTask = useCallback(async (taskId: string) => {
    if (!projectId) throw new Error('No project context')
    const result = await triggerRef.current({ projectId, taskId })
    await utils.tasks.list.invalidate({ projectId })
    await utils.tasks.executions.invalidate({ projectId, taskId })
    return result
  }, [projectId, utils])

  return useMemo(
    () => ({
      tasks: (listQuery.data as TaskDefinition[] | undefined) ?? [],
      tasksLoading: listQuery.isLoading,
      tasksError: listQuery.error,

      activeTask: (getQuery.data as TaskDefinition | undefined) ?? null,
      activeTaskLoading: getQuery.isLoading,
      activeTaskError: getQuery.error,
      loadTask,

      executions: (executionsQuery.data as TaskExecutionRecord[] | undefined) ?? [],
      executionsLoading: executionsQuery.isLoading,
      executionsError: executionsQuery.error,
      loadExecutions,

      createTask,
      updateTask,
      deleteTask,
      toggleTask,
      triggerTask,
    }),
    [
      listQuery.data, listQuery.isLoading, listQuery.error,
      getQuery.data, getQuery.isLoading, getQuery.error,
      loadTask,
      executionsQuery.data, executionsQuery.isLoading, executionsQuery.error,
      loadExecutions,
      createTask, updateTask, deleteTask, toggleTask, triggerTask,
    ],
  )
}

// ─── buildTasksSection helper ─────────────────────────────────────────────────

export function buildTasksSection(params: {
  tasks: TaskDefinition[]
  loading: boolean
  error: unknown
  onAdd: () => void
  navigate: (routeId: string, navParams?: Record<string, unknown>) => void
}): AssetSection {
  return {
    id: 'tasks',
    label: 'TASKS',
    items: params.tasks.map((task) => ({
      id: task.id,
      label: task.name,
      indicatorColor: task.enabled ? '#22c55e' : '#9ca3af',
      routeId: `task-detail::${task.id}`,
    })),
    collapsible: true,
    disabled: false,
    onAdd: params.onAdd,
  }
}
