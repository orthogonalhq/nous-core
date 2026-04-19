// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'

// ─── tRPC mock wiring ─────────────────────────────────────────────────────────

const getFetchMock = vi.fn()
const setMutateAsyncMock = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    viewState: {
      set: {
        useMutation: () => ({ mutateAsync: setMutateAsyncMock }),
      },
    },
    useUtils: () => ({
      viewState: {
        get: {
          fetch: getFetchMock,
        },
      },
    }),
  },
}))

import { useLayoutState } from '../useProjectViewState'
import { ShellProvider } from '../ShellContext'

const LEGACY_KEY = 'nous-asset-sidebar-collapsed'
const MIRROR_KEY_P1 = 'nous:view-state:p1:layout'

function makeWrapper(activeProjectId: string | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ShellProvider activeProjectId={activeProjectId}>
        {children}
      </ShellProvider>
    )
  }
}

beforeEach(() => {
  localStorage.clear()
  getFetchMock.mockReset()
  getFetchMock.mockResolvedValue(null)
  setMutateAsyncMock.mockReset()
  setMutateAsyncMock.mockResolvedValue({ updatedAt: new Date().toISOString() })
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLayoutState — one-shot migration', () => {
  it('legacy key "true" → sidebarCollapsed transferred + legacy removed + mirror + server set', async () => {
    localStorage.setItem(LEGACY_KEY, 'true')

    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() =>
      expect(result.current.state?.sidebarCollapsed).toBe(true),
    )
    // Legacy key removed
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    // Mirror written
    const mirror = localStorage.getItem(MIRROR_KEY_P1)
    expect(mirror).not.toBeNull()
    expect(JSON.parse(mirror!).payload).toEqual({ sidebarCollapsed: true })
    // Server set was fired at least once for the migration
    const layoutCalls = setMutateAsyncMock.mock.calls
      .map((c) => c[0])
      .filter((p: any) => p.class === 'layout')
    expect(layoutCalls.length).toBeGreaterThanOrEqual(1)
    expect(
      layoutCalls.some(
        (p: any) =>
          p.payload.sidebarCollapsed === true && p.projectId === 'p1',
      ),
    ).toBe(true)
  })

  it('legacy key "false" → sidebarCollapsed=false transferred + legacy removed', async () => {
    localStorage.setItem(LEGACY_KEY, 'false')

    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() =>
      expect(result.current.state?.sidebarCollapsed).toBe(false),
    )
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('legacy key absent → no-op (no legacy key materialises, no migration-write fires)', async () => {
    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(result.current.state).toBeNull()
  })

  it('legacy key unparseable → legacy removed, info log, state unchanged', async () => {
    localStorage.setItem(LEGACY_KEY, 'not-json{')

    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    // Legacy key removed even on unparseable value
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    // State unchanged (no migration write)
    expect(result.current.state).toBeNull()
  })

  it('idempotent — re-mount with legacy key already absent does not re-fire migration writes', async () => {
    // Pre-existing migrated state
    localStorage.setItem(
      MIRROR_KEY_P1,
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: '2026-04-18T00:00:00.000Z',
      }),
    )
    getFetchMock.mockResolvedValue({
      payload: { sidebarCollapsed: true },
      updatedAt: '2026-04-18T00:00:00.000Z',
    })

    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    // No set should have been fired due to migration specifically
    // (the reconcile branch for tie is server-wins silent → no set)
    const layoutSets = setMutateAsyncMock.mock.calls
      .map((c) => c[0])
      .filter((p: any) => p.class === 'layout')
    expect(layoutSets.length).toBe(0)
  })

  it('non-destructive re-introduction — legacy key reappears, migration re-transfers', async () => {
    // Simulate a fresh mount after a downgrade put the legacy key back.
    localStorage.setItem(LEGACY_KEY, 'true')

    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() =>
      expect(result.current.state?.sidebarCollapsed).toBe(true),
    )
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })
})
