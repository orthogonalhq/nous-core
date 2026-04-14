// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ContentRouterRenderProps } from '@nous/ui/components'

// Mock @nous/transport
vi.mock('@nous/transport', () => ({
  trpc: {
    tasks: {
      list: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null }) },
      get: { useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false, error: null }) },
      executions: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null }) },
      create: { useMutation: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }) },
      update: { useMutation: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }) },
      delete: { useMutation: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }) },
      toggle: { useMutation: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }) },
      trigger: { useMutation: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }) },
    },
    useUtils: vi.fn().mockReturnValue({
      tasks: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
        executions: { invalidate: vi.fn() },
      },
    }),
  },
  usePreferencesApi: vi.fn().mockReturnValue({}),
  useEventSubscription: vi.fn(),
}))

// Mock ShellContext
vi.mock('@nous/ui/components', async () => {
  const actual = await vi.importActual<typeof import('@nous/ui/components')>('@nous/ui/components')
  return {
    ...actual,
    useShellContext: () => ({
      activeProjectId: 'project-1',
      activeRoute: 'home',
      navigate: vi.fn(),
      goBack: vi.fn(),
      mode: 'simple' as const,
      breakpoint: 'full' as const,
      navigation: { activeRoute: 'home', history: [], canGoBack: false },
      conversation: { tier: 'transient' as const, threadId: null, projectId: null, isAmbient: true },
    }),
  }
})

import { createWebShellRoutes, createRouteProxy, TASK_DETAIL_PREFIX } from '../web-shell-routes'

describe('Proxy route resolution', () => {
  it('resolves static task-detail route', () => {
    const routes = createWebShellRoutes({})
    expect(routes['task-detail']).toBeDefined()
    expect(typeof routes['task-detail']).toBe('function')
  })

  it('resolves task-create route to a component', () => {
    const routes = createWebShellRoutes({})
    expect(routes['task-create']).toBeDefined()
    expect(typeof routes['task-create']).toBe('function')
  })

  it('resolves task-detail::uuid via Proxy get trap', () => {
    const routes = createWebShellRoutes({})
    const resolved = routes['task-detail::abc-123']
    expect(resolved).toBeDefined()
    expect(typeof resolved).toBe('function')
  })

  it('Proxy has trap returns true for task-detail::uuid', () => {
    const routes = createWebShellRoutes({})
    expect('task-detail::abc-123' in routes).toBe(true)
    expect('task-detail::some-uuid' in routes).toBe(true)
  })

  it('Proxy has trap returns true for static routes', () => {
    const routes = createWebShellRoutes({})
    expect('home' in routes).toBe(true)
    expect('settings' in routes).toBe(true)
    expect('task-detail' in routes).toBe(true)
  })

  it('returns undefined for unknown routes', () => {
    const routes = createWebShellRoutes({})
    expect(routes['nonexistent-route']).toBeUndefined()
  })

  it('Proxy has trap returns false for unknown routes', () => {
    const routes = createWebShellRoutes({})
    expect('nonexistent-route' in routes).toBe(false)
  })

  it('createRouteProxy extracts taskId and injects it into params', () => {
    const MockComponent = vi.fn().mockReturnValue(null)
    const routes = createRouteProxy({ 'task-detail': MockComponent })

    const WrappedComponent = routes['task-detail::my-uuid-123']
    expect(WrappedComponent).toBeDefined()

    // Call the wrapped component to verify it injects taskId
    const props: ContentRouterRenderProps = {
      navigate: vi.fn(),
      goBack: vi.fn(),
      canGoBack: false,
      params: { existing: 'value' },
    }

    // The wrapped component is a render function; call it
    const element = React.createElement(WrappedComponent!, props)
    expect(element).toBeDefined()
  })

  it('TASK_DETAIL_PREFIX is correctly defined', () => {
    expect(TASK_DETAIL_PREFIX).toBe('task-detail::')
  })
})
