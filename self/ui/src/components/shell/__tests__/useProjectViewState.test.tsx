// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import * as React from 'react'

// ─── tRPC mock wiring ─────────────────────────────────────────────────────────
//
// `useProjectViewState` uses `trpc.useUtils().viewState.get.fetch(...)` for the
// post-paint reconcile and `trpc.viewState.set.useMutation().mutateAsync(...)`
// for writes. We mock both surfaces here.

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

import {
  useContentState,
  useFocusState,
  useLayoutState,
  useNavigationState,
  useProjectViewState,
} from '../useProjectViewState'
import { ShellProvider } from '../ShellContext'

const NOW = '2026-04-18T00:00:00.000Z'
const LATER = '2026-04-18T01:00:00.000Z'
const EARLIER = '2026-04-17T00:00:00.000Z'

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
  setMutateAsyncMock.mockReset()
  setMutateAsyncMock.mockResolvedValue({ updatedAt: LATER })
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tier 1: Contract tests ──────────────────────────────────────────────────

describe('useProjectViewState — contract', () => {
  it('returns shape { state, setState, hydrated } with state=null when mirror absent', async () => {
    getFetchMock.mockResolvedValue(null)
    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    expect(result.current.state).toBeNull()
    expect(typeof result.current.setState).toBe('function')
    expect(typeof result.current.hydrated).toBe('boolean')

    await waitFor(() => expect(result.current.hydrated).toBe(true))
  })

  it('short-circuits when activeProjectId is null — state null, hydrated true', async () => {
    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper(null),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.state).toBeNull()
    expect(getFetchMock).not.toHaveBeenCalled()
  })
})

// ─── Tier 2: First-paint from mirror ─────────────────────────────────────────

describe('useProjectViewState — first-paint', () => {
  it('first-paint state matches mirror payload when present', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }),
    )
    getFetchMock.mockResolvedValue(null)

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    // Synchronous first paint — state is populated immediately
    expect(result.current.state).toEqual({ sidebarCollapsed: true })
  })

  it('first-paint state is null when mirror absent', async () => {
    getFetchMock.mockResolvedValue(null)
    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    expect(result.current.state).toBeNull()
  })
})

// ─── Tier 2: Reconcile branches ──────────────────────────────────────────────

describe('useProjectViewState — reconcile branches', () => {
  it('server-null branch: mirror non-null → fires set(local)', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }),
    )
    getFetchMock.mockResolvedValue(null)

    renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(setMutateAsyncMock).toHaveBeenCalled())
    expect(setMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'layout',
        projectId: 'p1',
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }),
    )
  })

  it('server-newer branch: state adopts server payload + mirror refreshed', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: false },
        updatedAt: EARLIER,
      }),
    )
    getFetchMock.mockResolvedValue({
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    })

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() =>
      expect(result.current.state).toEqual({ sidebarCollapsed: true }),
    )

    const mirrorRaw = localStorage.getItem('nous:view-state:p1:layout')
    expect(mirrorRaw).not.toBeNull()
    const mirror = JSON.parse(mirrorRaw!)
    expect(mirror.payload).toEqual({ sidebarCollapsed: true })
    expect(mirror.updatedAt).toBe(NOW)
  })

  it('tie branch: server wins silently (state reflects server, mirror re-synced)', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: false },
        updatedAt: NOW,
      }),
    )
    getFetchMock.mockResolvedValue({
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    })

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() =>
      expect(result.current.state).toEqual({ sidebarCollapsed: true }),
    )
    // No server.set fired on tie
    expect(setMutateAsyncMock).not.toHaveBeenCalled()
  })

  it('local-newer branch: fires set(local), state retains local', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: LATER,
      }),
    )
    getFetchMock.mockResolvedValue({
      payload: { sidebarCollapsed: false },
      updatedAt: EARLIER,
    })

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(setMutateAsyncMock).toHaveBeenCalled())
    expect(setMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'layout',
        payload: { sidebarCollapsed: true },
        updatedAt: LATER,
      }),
    )
    // State retains local payload (not the older server payload)
    expect(result.current.state).toEqual({ sidebarCollapsed: true })
  })
})

// ─── Tier 2: Write path ──────────────────────────────────────────────────────

describe('useProjectViewState — setState write path', () => {
  it('synchronously updates state, writes mirror, and fires server set', async () => {
    getFetchMock.mockResolvedValue(null)

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    setMutateAsyncMock.mockClear()

    act(() => {
      result.current.setState({ sidebarCollapsed: true })
    })

    // React state flips synchronously
    expect(result.current.state).toEqual({ sidebarCollapsed: true })
    // Mirror was written
    const raw = localStorage.getItem('nous:view-state:p1:layout')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.payload).toEqual({ sidebarCollapsed: true })
    expect(typeof parsed.updatedAt).toBe('string')

    // Server mutation fired with class/projectId/payload
    expect(setMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'layout',
        projectId: 'p1',
        payload: { sidebarCollapsed: true },
      }),
    )
  })
})

// ─── Tier 2: hydrated truth-table ────────────────────────────────────────────

describe('useProjectViewState — hydrated', () => {
  it('flips true on server success', async () => {
    getFetchMock.mockResolvedValue(null)
    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
  })

  it('flips true after server error (local retained)', async () => {
    localStorage.setItem(
      'nous:view-state:p1:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }),
    )
    getFetchMock.mockRejectedValue(new Error('network boom'))

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    // State retained from mirror
    expect(result.current.state).toEqual({ sidebarCollapsed: true })
  })
})

// ─── Tier 2: project-switch re-init ──────────────────────────────────────────

describe('useProjectViewState — project switch re-init', () => {
  it('re-runs first-paint + reconcile for the new project on activeProjectId change', async () => {
    localStorage.setItem(
      'nous:view-state:A:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }),
    )
    localStorage.setItem(
      'nous:view-state:B:layout',
      JSON.stringify({
        payload: { sidebarCollapsed: false },
        updatedAt: NOW,
      }),
    )
    getFetchMock.mockResolvedValue(null)

    // The hook's `activeProjectId` comes from ShellContext. To drive a switch,
    // we render both the provider and the hook consumer inside a harness we
    // can re-render with a new prop.
    const renderResults: { current: ReturnType<typeof useProjectViewState<'layout'>> | null } = {
      current: null,
    }
    function Consumer() {
      renderResults.current = useProjectViewState('layout')
      return null
    }
    function Harness({ activeProjectId }: { activeProjectId: string }) {
      return (
        <ShellProvider activeProjectId={activeProjectId}>
          <Consumer />
        </ShellProvider>
      )
    }

    const { render } = await import('@testing-library/react')
    const { rerender } = render(<Harness activeProjectId="A" />)

    await waitFor(() => expect(renderResults.current?.hydrated).toBe(true))
    expect(renderResults.current?.state).toEqual({ sidebarCollapsed: true })

    rerender(<Harness activeProjectId="B" />)

    await waitFor(() =>
      expect(renderResults.current?.state).toEqual({ sidebarCollapsed: false }),
    )
    const calls = getFetchMock.mock.calls.map((c) => c[0])
    expect(calls.some((c: any) => c.projectId === 'A')).toBe(true)
    expect(calls.some((c: any) => c.projectId === 'B')).toBe(true)
  })
})

// ─── Tier 3: edge cases ──────────────────────────────────────────────────────

describe('useProjectViewState — edge cases', () => {
  it('localStorage setItem throws → setState does not throw; info log once', async () => {
    getFetchMock.mockResolvedValue(null)
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })

    const { result } = renderHook(() => useProjectViewState('layout'), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(() => {
      act(() => {
        result.current.setState({ sidebarCollapsed: true })
      })
    }).not.toThrow()

    expect(setItemSpy).toHaveBeenCalled()
    // Still updates in-memory state
    expect(result.current.state).toEqual({ sidebarCollapsed: true })
  })
})

// ─── Wrapper delegation ──────────────────────────────────────────────────────

describe('wrappers', () => {
  it('useLayoutState reads/writes the layout class', async () => {
    getFetchMock.mockResolvedValue(null)
    const { result } = renderHook(() => useLayoutState(), {
      wrapper: makeWrapper('p1'),
    })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    setMutateAsyncMock.mockClear()

    act(() => {
      result.current.setState({ sidebarCollapsed: true })
    })

    expect(setMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ class: 'layout' }),
    )
  })

  it('useNavigationState and useFocusState delegate to their respective classes', async () => {
    getFetchMock.mockResolvedValue(null)

    const { result: navResult } = renderHook(() => useNavigationState(), {
      wrapper: makeWrapper('p1'),
    })
    const { result: focusResult } = renderHook(() => useFocusState(), {
      wrapper: makeWrapper('p1'),
    })

    await waitFor(() => expect(navResult.current.hydrated).toBe(true))
    await waitFor(() => expect(focusResult.current.hydrated).toBe(true))
    setMutateAsyncMock.mockClear()

    act(() => {
      navResult.current.setState({ activeRoute: '/chat' })
    })
    act(() => {
      focusResult.current.setState({ panelFocus: 'chat' })
    })

    const classes = setMutateAsyncMock.mock.calls.map((c) => c[0].class)
    expect(classes).toContain('navigation')
    expect(classes).toContain('focus')
  })

  it('useContentState narrows by contentKey and writes back to the parent', async () => {
    getFetchMock.mockResolvedValue(null)

    const { result } = renderHook(() => useContentState('chat'), {
      wrapper: makeWrapper('p1'),
    })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    setMutateAsyncMock.mockClear()

    act(() => {
      result.current.setState({ draft: 'hello' })
    })

    // The parent write carries the full content record with the chat sub-key.
    expect(setMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'content',
        payload: { chat: { draft: 'hello' } },
      }),
    )
  })
})
