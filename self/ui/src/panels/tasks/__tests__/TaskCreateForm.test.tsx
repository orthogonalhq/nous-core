// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDefinition } from '@nous/shared'

// Mock useTasks hook
const mockLoadTask = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()

const mockUseTasksReturn = {
  tasks: [],
  tasksLoading: false,
  tasksError: null,
  activeTask: null as TaskDefinition | null,
  activeTaskLoading: false,
  activeTaskError: null,
  loadTask: mockLoadTask,
  executions: [],
  executionsLoading: false,
  executionsError: null,
  loadExecutions: vi.fn(),
  createTask: mockCreateTask,
  updateTask: mockUpdateTask,
  deleteTask: vi.fn(),
  toggleTask: vi.fn(),
  triggerTask: vi.fn(),
}

vi.mock('../../../hooks/useTasks', () => ({
  useTasks: () => mockUseTasksReturn,
}))

// Mock ShellContext
vi.mock('../../../components/shell/ShellContext', () => ({
  useShellContext: () => ({
    activeProjectId: 'project-1',
    activeRoute: 'task-create',
    navigate: vi.fn(),
    goBack: vi.fn(),
    mode: 'simple' as const,
    breakpoint: 'full' as const,
    navigation: { activeRoute: 'task-create', history: [], canGoBack: false },
    conversation: { tier: 'transient' as const, threadId: null, projectId: null, isAmbient: true },
  }),
}))

// Import after mocks
import { TaskCreateForm } from '../TaskCreateForm'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

const mockNavigate = vi.fn()
const mockGoBack = vi.fn()

async function renderForm(params?: Record<string, unknown>) {
  await act(async () => {
    root.render(
      <TaskCreateForm
        navigate={mockNavigate}
        goBack={mockGoBack}
        canGoBack={true}
        params={params}
      />,
    )
    await flush()
  })
}

function getInput(testId: string): HTMLInputElement {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement
}

function getTextarea(testId: string): HTMLTextAreaElement {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLTextAreaElement
}

function getSelect(testId: string): HTMLSelectElement {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLSelectElement
}

function getButton(testId: string): HTMLButtonElement {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
}

async function setInputValue(testId: string, value: string) {
  const inputEl = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | HTMLTextAreaElement
  await act(async () => {
    // Use the correct prototype setter for the element type
    const isTextarea = inputEl instanceof HTMLTextAreaElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeSetter?.call(inputEl, value)
    inputEl.dispatchEvent(new Event('input', { bubbles: true }))
    inputEl.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}

async function setSelectValue(testId: string, value: string) {
  const select = getSelect(testId)
  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value'
    )?.set
    nativeSetter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  mockUseTasksReturn.activeTask = null
  mockUseTasksReturn.activeTaskLoading = false
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

describe('TaskCreateForm', () => {
  it('renders create mode form with empty fields', async () => {
    await renderForm()

    expect(container.querySelector('[data-testid="task-create-form"]')).toBeTruthy()
    expect(container.textContent).toContain('Create Task')
    expect(getInput('name-input').value).toBe('')
    expect(getInput('description-input').value).toBe('')
    expect(getSelect('trigger-type-select').value).toBe('manual')
    expect(getTextarea('instructions-input').value).toBe('')
  })

  it('renders edit mode heading when taskId is provided', async () => {
    mockUseTasksReturn.activeTask = {
      id: 'task-edit-1',
      name: 'Existing Task',
      description: 'Existing desc',
      trigger: { type: 'manual' },
      orchestratorInstructions: 'Do existing work',
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    await renderForm({ taskId: 'task-edit-1' })

    expect(container.textContent).toContain('Edit Task')
    expect(mockLoadTask).toHaveBeenCalledWith('task-edit-1')
  })

  it('shows cron fields only when heartbeat trigger is selected', async () => {
    await renderForm()

    // Initially manual - no cron fields
    expect(container.querySelector('[data-testid="cron-input"]')).toBeFalsy()

    // Switch to heartbeat
    await setSelectValue('trigger-type-select', 'heartbeat')

    expect(container.querySelector('[data-testid="cron-input"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="timezone-input"]')).toBeTruthy()
  })

  it('shows webhook fields only when webhook trigger is selected', async () => {
    await renderForm()

    // Initially manual - no webhook fields
    expect(container.querySelector('[data-testid="path-segment-input"]')).toBeFalsy()

    // Switch to webhook
    await setSelectValue('trigger-type-select', 'webhook')

    expect(container.querySelector('[data-testid="path-segment-input"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="secret-input"]')).toBeTruthy()
  })

  it('auto-generates webhook secret when webhook type selected', async () => {
    await renderForm()
    await setSelectValue('trigger-type-select', 'webhook')

    const secretInput = getInput('secret-input')
    expect(secretInput.value).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/.test(secretInput.value)).toBe(true)
  })

  it('validates that name is required on submit', async () => {
    await renderForm()

    // Fill instructions but leave name empty
    await setInputValue('instructions-input', 'Some instructions')

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="name-error"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="name-error"]')?.textContent).toContain('required')
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('validates that orchestratorInstructions is required on submit', async () => {
    await renderForm()

    // Fill name but leave instructions empty
    await setInputValue('name-input', 'My Task')

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="instructions-error"]')).toBeTruthy()
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('validates cron expression for heartbeat triggers', async () => {
    await renderForm()

    await setInputValue('name-input', 'My Task')
    await setInputValue('instructions-input', 'Do things')
    await setSelectValue('trigger-type-select', 'heartbeat')
    // Leave cron empty

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="cron-error"]')).toBeTruthy()
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('validates pathSegment for webhook triggers', async () => {
    await renderForm()

    await setInputValue('name-input', 'My Task')
    await setInputValue('instructions-input', 'Do things')
    await setSelectValue('trigger-type-select', 'webhook')
    // Leave pathSegment empty

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="path-segment-error"]')).toBeTruthy()
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('validates context as valid JSON', async () => {
    await renderForm()

    await setInputValue('name-input', 'My Task')
    await setInputValue('instructions-input', 'Do things')
    await setInputValue('context-input', '{ invalid json }')

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="context-error"]')).toBeTruthy()
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('calls goBack when cancel button is clicked', async () => {
    await renderForm()

    const cancelBtn = getButton('cancel-button')
    await act(async () => {
      cancelBtn.click()
      await flush()
    })

    expect(mockGoBack).toHaveBeenCalled()
  })

  it('calls createTask and navigates on successful create', async () => {
    const createdTask: TaskDefinition = {
      id: 'new-task-id',
      name: 'New Task',
      description: '',
      trigger: { type: 'manual' },
      orchestratorInstructions: 'Do the work',
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mockCreateTask.mockResolvedValue(createdTask)

    await renderForm()

    await setInputValue('name-input', 'New Task')
    await setInputValue('instructions-input', 'Do the work')

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(mockCreateTask).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('task-detail::new-task-id')
  })

  it('shows name conflict error from mutation', async () => {
    mockCreateTask.mockRejectedValue(new Error('task_name_conflict: a task named "Dup" already exists'))

    await renderForm()

    await setInputValue('name-input', 'Dup')
    await setInputValue('instructions-input', 'Instructions')

    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(container.querySelector('[data-testid="name-error"]')?.textContent).toContain('already exists')
  })

  it('calls updateTask in edit mode on submit', async () => {
    const existingTask: TaskDefinition = {
      id: 'edit-task-id',
      name: 'Old Name',
      description: 'Old desc',
      trigger: { type: 'manual' },
      orchestratorInstructions: 'Old instructions',
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mockUseTasksReturn.activeTask = existingTask
    mockUpdateTask.mockResolvedValue({ ...existingTask, name: 'Updated Name' })

    await renderForm({ taskId: 'edit-task-id' })

    // The form should be pre-populated; submit it
    const submitBtn = getButton('submit-button')
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(mockUpdateTask).toHaveBeenCalledWith('edit-task-id', expect.any(Object))
    expect(mockNavigate).toHaveBeenCalledWith('task-detail::edit-task-id')
  })
})
