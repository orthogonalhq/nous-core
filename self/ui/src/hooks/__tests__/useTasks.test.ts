// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildTasksSection } from '../useTasks'
import type { TaskDefinition } from '@nous/shared'

// --- buildTasksSection tests (pure function, no React hooks needed) ---

function makeTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 'task-abc-123',
    name: 'Test Task',
    description: 'A test task',
    trigger: { type: 'manual' },
    orchestratorInstructions: 'Do the thing',
    enabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildTasksSection', () => {
  const mockNavigate = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an AssetSection with id "tasks" and label "TASKS"', () => {
    const section = buildTasksSection({
      tasks: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.id).toBe('tasks')
    expect(section.label).toBe('TASKS')
    expect(section.collapsible).toBe(true)
    expect(section.disabled).toBe(false)
  })

  it('returns empty items array when no tasks', () => {
    const section = buildTasksSection({
      tasks: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toEqual([])
  })

  it('maps tasks to AssetSectionItem with correct routeId format', () => {
    const tasks = [
      makeTask({ id: 'uuid-1', name: 'First Task' }),
      makeTask({ id: 'uuid-2', name: 'Second Task' }),
    ]

    const section = buildTasksSection({
      tasks,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toHaveLength(2)
    expect(section.items[0].id).toBe('uuid-1')
    expect(section.items[0].label).toBe('First Task')
    expect(section.items[0].routeId).toBe('task-detail::uuid-1')
    expect(section.items[1].routeId).toBe('task-detail::uuid-2')
  })

  it('sets green indicatorColor for enabled tasks', () => {
    const tasks = [makeTask({ id: 'uuid-1', enabled: true })]

    const section = buildTasksSection({
      tasks,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items[0].indicatorColor).toBe('#22c55e')
  })

  it('sets gray indicatorColor for disabled tasks', () => {
    const tasks = [makeTask({ id: 'uuid-1', enabled: false })]

    const section = buildTasksSection({
      tasks,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items[0].indicatorColor).toBe('#9ca3af')
  })

  it('sets onAdd from params', () => {
    const section = buildTasksSection({
      tasks: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.onAdd).toBe(mockOnAdd)
    section.onAdd!()
    expect(mockOnAdd).toHaveBeenCalledOnce()
  })

  it('correctly handles mixed enabled/disabled tasks', () => {
    const tasks = [
      makeTask({ id: '1', name: 'Enabled', enabled: true }),
      makeTask({ id: '2', name: 'Disabled', enabled: false }),
      makeTask({ id: '3', name: 'Also Enabled', enabled: true }),
    ]

    const section = buildTasksSection({
      tasks,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items[0].indicatorColor).toBe('#22c55e')
    expect(section.items[1].indicatorColor).toBe('#9ca3af')
    expect(section.items[2].indicatorColor).toBe('#22c55e')
  })
})
