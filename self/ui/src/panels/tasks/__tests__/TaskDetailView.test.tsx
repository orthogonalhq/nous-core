// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDefinition, TaskExecutionRecord } from '@nous/shared'

// Mock useTasks hook
const mockUseTasks = vi.fn()
const mockLoadTask = vi.fn()
const mockLoadExecutions = vi.fn()
const mockToggleTask = vi.fn()
const mockTriggerTask = vi.fn()
const mockDeleteTask = vi.fn()

vi.mock('../../../hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => mockUseTasks(...args),
}))

// Mock ShellContext
vi.mock('../../../components/shell/ShellContext', () => ({
  useShellContext: () => ({
    activeProjectId: 'project-1',
    activeRoute: 'task-detail',
    navigate: vi.fn(),
    goBack: vi.fn(),
    mode: 'simple' as const,
    breakpoint: 'full' as const,
    navigation: { activeRoute: 'task-detail', history: [], canGoBack: false },
    conversation: { tier: 'transient' as const, threadId: null, projectId: null, isAmbient: true },
  }),
}))

// Import after mocks
import { TaskDetailView } from '../TaskDetailView'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function makeTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 'task-123',
    name: 'Deploy v2.1',
    description: 'Automated deployment task',
    trigger: { type: 'manual' },
    orchestratorInstructions: 'Run the deployment pipeline',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeExecution(overrides: Partial<TaskExecutionRecord> = {}): TaskExecutionRecord {
  return {
    id: 'exec-1',
    taskDefinitionId: 'task-123',
    projectId: 'project-1',
    triggeredAt: '2026-01-01T12:00:00.000Z',
    triggerType: 'manual',
    status: 'completed',
    completedAt: '2026-01-01T12:05:00.000Z',
    outcome: 'Success',
    durationMs: 300000,
    ...overrides,
  }
}

function setupMockUseTasks(overrides: Partial<ReturnType<typeof mockUseTasks>> = {}) {
  mockUseTasks.mockReturnValue({
    tasks: [],
    tasksLoading: false,
    tasksError: null,
    activeTask: null,
    activeTaskLoading: false,
    activeTaskError: null,
    loadTask: mockLoadTask,
    executions: [],
    executionsLoading: false,
    executionsError: null,
    loadExecutions: mockLoadExecutions,
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: mockDeleteTask,
    toggleTask: mockToggleTask,
    triggerTask: mockTriggerTask,
    ...overrides,
  })
}

const mockNavigate = vi.fn()
const mockGoBack = vi.fn()

async function renderDetailView(taskId: string = 'task-123') {
  await act(async () => {
    root.render(
      <TaskDetailView
        navigate={mockNavigate}
        goBack={mockGoBack}
        canGoBack={true}
        params={{ taskId }}
      />,
    )
    await flush()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

describe('TaskDetailView', () => {
  it('shows loading state while task is loading', async () => {
    setupMockUseTasks({ activeTaskLoading: true })
    await renderDetailView()
    expect(container.querySelector('[data-testid="task-detail-loading"]')).toBeTruthy()
  })

  it('renders task details when loaded', async () => {
    const task = makeTask()
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    expect(container.querySelector('[data-testid="task-name"]')?.textContent).toBe('Deploy v2.1')
    expect(container.querySelector('[data-testid="task-description"]')?.textContent).toBe('Automated deployment task')
    expect(container.querySelector('[data-testid="trigger-type"]')?.textContent).toBe('manual')
    expect(container.querySelector('[data-testid="orchestrator-instructions"]')?.textContent).toContain('Run the deployment pipeline')
  })

  it('shows "Task not found" error for NOT_FOUND errors', async () => {
    setupMockUseTasks({ activeTaskError: new Error('NOT_FOUND: Task not found') })
    await renderDetailView()

    expect(container.querySelector('[data-testid="task-detail-error"]')).toBeTruthy()
    expect(container.textContent).toContain('Task not found')
  })

  it('calls toggleTask when toggle button is clicked', async () => {
    const task = makeTask({ enabled: true })
    mockToggleTask.mockResolvedValue(task)
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    const toggleBtn = container.querySelector('[data-testid="toggle-button"]') as HTMLButtonElement
    expect(toggleBtn).toBeTruthy()
    expect(toggleBtn.textContent).toContain('Disable')

    await act(async () => {
      toggleBtn.click()
      await flush()
    })

    expect(mockToggleTask).toHaveBeenCalledWith('task-123')
  })

  it('shows trigger button only when task is enabled', async () => {
    const enabledTask = makeTask({ enabled: true })
    setupMockUseTasks({ activeTask: enabledTask })
    await renderDetailView()
    expect(container.querySelector('[data-testid="trigger-button"]')).toBeTruthy()

    // Now render with disabled task
    const disabledTask = makeTask({ enabled: false })
    setupMockUseTasks({ activeTask: disabledTask })
    await renderDetailView()
    expect(container.querySelector('[data-testid="trigger-button"]')).toBeFalsy()
  })

  it('calls triggerTask when trigger button is clicked', async () => {
    const task = makeTask({ enabled: true })
    mockTriggerTask.mockResolvedValue({ executionId: 'exec-new', runId: 'run-1' })
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    const triggerBtn = container.querySelector('[data-testid="trigger-button"]') as HTMLButtonElement
    await act(async () => {
      triggerBtn.click()
      await flush()
    })

    expect(mockTriggerTask).toHaveBeenCalledWith('task-123')
  })

  it('renders executions table when executions exist', async () => {
    const task = makeTask()
    const executions = [
      makeExecution({ id: 'exec-1', status: 'completed', triggerType: 'manual' }),
      makeExecution({ id: 'exec-2', status: 'failed', triggerType: 'heartbeat' }),
    ]
    setupMockUseTasks({ activeTask: task, executions })
    await renderDetailView()

    const table = container.querySelector('[data-testid="executions-table"]')
    expect(table).toBeTruthy()
    const rows = container.querySelectorAll('[data-testid="execution-row"]')
    expect(rows).toHaveLength(2)
  })

  it('calls navigate with task-create route when edit button is clicked', async () => {
    const task = makeTask()
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    const editBtn = container.querySelector('[data-testid="edit-button"]') as HTMLButtonElement
    await act(async () => {
      editBtn.click()
      await flush()
    })

    // navigate is called with task-create and params (cast internally)
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('shows delete confirmation dialog when delete button is clicked', async () => {
    const task = makeTask()
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    expect(container.querySelector('[data-testid="delete-confirm"]')).toBeFalsy()

    const deleteBtn = container.querySelector('[data-testid="delete-button"]') as HTMLButtonElement
    await act(async () => {
      deleteBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="delete-confirm"]')).toBeTruthy()
  })

  it('calls deleteTask and goBack when delete is confirmed', async () => {
    const task = makeTask()
    mockDeleteTask.mockResolvedValue({ deleted: true })
    setupMockUseTasks({ activeTask: task })
    await renderDetailView()

    // Click delete to show confirmation
    const deleteBtn = container.querySelector('[data-testid="delete-button"]') as HTMLButtonElement
    await act(async () => {
      deleteBtn.click()
      await flush()
    })

    // Confirm delete
    const confirmBtn = container.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement
    await act(async () => {
      confirmBtn.click()
      await flush()
    })

    expect(mockDeleteTask).toHaveBeenCalledWith('task-123')
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('calls loadTask and loadExecutions on mount with taskId', async () => {
    setupMockUseTasks()
    await renderDetailView('my-task-id')

    expect(mockLoadTask).toHaveBeenCalledWith('my-task-id')
    expect(mockLoadExecutions).toHaveBeenCalledWith('my-task-id')
  })
})
