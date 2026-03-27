import { describe, it, expect } from 'vitest'
import { webShellRoutes } from '@/components/shell/web-shell-routes'

describe('webShellRoutes', () => {
  const EXPECTED_KEYS = [
    'home', 'chat', 'projects', 'traces',
    'config', 'settings', 'mao', 'threads', 'workflows', 'skills',
  ]

  it('has exactly 10 keys', () => {
    expect(Object.keys(webShellRoutes).length).toBe(10)
  })

  it('each value is a function (valid ComponentType)', () => {
    for (const [key, value] of Object.entries(webShellRoutes)) {
      expect(typeof value).toBe('function')
    }
  })

  it('all required keys present', () => {
    const keys = Object.keys(webShellRoutes)
    for (const expected of EXPECTED_KEYS) {
      expect(keys).toContain(expected)
    }
  })
})
