import { describe, it, expect } from 'vitest'
import { createWebShellRoutes } from '@/components/shell/web-shell-routes'

describe('createWebShellRoutes', () => {
  const EXPECTED_KEYS = [
    'home', 'settings', 'threads', 'workflows', 'skills', 'apps',
  ]

  const routes = createWebShellRoutes({})

  it('has exactly 6 keys', () => {
    expect(Object.keys(routes).length).toBe(6)
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
