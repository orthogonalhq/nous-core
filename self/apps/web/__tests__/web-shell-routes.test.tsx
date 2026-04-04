import { describe, it, expect } from 'vitest'
import { createWebShellRoutes } from '@/components/shell/web-shell-routes'

describe('createWebShellRoutes', () => {
  const EXPECTED_KEYS = [
    'home', 'settings', 'threads', 'workflows', 'skills', 'apps',
    'dashboard', 'org-chart', 'inbox', 'workflow-detail', 'tasks', 'task-detail', 'task-create', 'agents', 'agent-detail',
  ]

  const routes = createWebShellRoutes({})

  it('has exactly 15 keys', () => {
    expect(Object.keys(routes).length).toBe(15)
  })

  it('each value is a function (valid ComponentType)', () => {
    for (const [key, value] of Object.entries(routes)) {
      expect(typeof value).toBe('function')
    }
  })

  it('all required keys present', () => {
    const keys = Object.keys(routes)
    for (const expected of EXPECTED_KEYS) {
      expect(keys).toContain(expected)
    }
  })
})
