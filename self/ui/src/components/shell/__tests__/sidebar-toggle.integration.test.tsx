// @vitest-environment jsdom

/**
 * Shell-level integration test for the sidebar-toggle persistence path.
 *
 * Covers the seam between `useLayoutState` and the migrated call-site pattern
 * used by both `self/apps/desktop/src/renderer/src/App.tsx:855` and
 * `self/apps/web/app/(shell)/layout.tsx:87`. We don't mount the full shell
 * (that would require re-mocking the rest of the app's DI tree); we mount the
 * exact integration pattern the call sites use, driven by real DOM events,
 * and assert user-observable state: the new mirror key carries the collapsed
 * flag, and the legacy `nous-asset-sidebar-collapsed` key is gone after
 * migration.
 *
 * Goals Acceptance C8 / Manifest §Decomposition Constraints #11.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import * as React from 'react'

// ─── tRPC mock wiring (real localStorage; server calls stubbed) ──────────────

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
const MIRROR_KEY = 'nous:view-state:project-alpha:layout'

// Shell-site pattern: the call sites do exactly this — read
// `layout?.sidebarCollapsed`, drive a boolean toggle through the setter.
function ShellSite() {
  const { state: layoutState, setState: setLayoutState } = useLayoutState()
  const sidebarCollapsed = layoutState?.sidebarCollapsed ?? false
  const setSidebarCollapsed = React.useCallback(
    (next: boolean) =>
      setLayoutState({
        ...(layoutState ?? {}),
        sidebarCollapsed: next,
      }),
    [layoutState, setLayoutState],
  )
  return (
    <div>
      <span data-testid="collapsed-value">{String(sidebarCollapsed)}</span>
      <button
        data-testid="toggle"
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      >
        toggle
      </button>
    </div>
  )
}

function Harness({ activeProjectId }: { activeProjectId: string }) {
  return (
    <ShellProvider activeProjectId={activeProjectId}>
      <ShellSite />
    </ShellProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  getFetchMock.mockReset()
  getFetchMock.mockResolvedValue(null)
  setMutateAsyncMock.mockReset()
  setMutateAsyncMock.mockResolvedValue({
    updatedAt: new Date().toISOString(),
  })
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Sidebar toggle shell-level integration', () => {
  it('toggle writes the new mirror key and never writes the legacy key', async () => {
    const { getByTestId } = render(<Harness activeProjectId="project-alpha" />)

    await waitFor(() =>
      expect(getByTestId('collapsed-value').textContent).toBe('false'),
    )

    act(() => {
      fireEvent.click(getByTestId('toggle'))
    })

    await waitFor(() =>
      expect(getByTestId('collapsed-value').textContent).toBe('true'),
    )

    // Mirror key carries the collapsed flag
    const mirror = localStorage.getItem(MIRROR_KEY)
    expect(mirror).not.toBeNull()
    expect(JSON.parse(mirror!).payload.sidebarCollapsed).toBe(true)
    // Legacy key never surfaces from a toggle after migration
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('legacy key present at mount is migrated + removed; toggle continues to write only the new key', async () => {
    localStorage.setItem(LEGACY_KEY, 'true')

    const { getByTestId } = render(<Harness activeProjectId="project-alpha" />)

    // After migration fires, state reflects the legacy value.
    await waitFor(() =>
      expect(getByTestId('collapsed-value').textContent).toBe('true'),
    )
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    const mirror = localStorage.getItem(MIRROR_KEY)
    expect(JSON.parse(mirror!).payload.sidebarCollapsed).toBe(true)

    // Toggle flips to false — legacy key must stay absent.
    act(() => {
      fireEvent.click(getByTestId('toggle'))
    })
    await waitFor(() =>
      expect(getByTestId('collapsed-value').textContent).toBe('false'),
    )
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('reload restores collapsed state from mirror on first paint', async () => {
    // Pre-seed the mirror (simulates a prior session's write)
    localStorage.setItem(
      MIRROR_KEY,
      JSON.stringify({
        payload: { sidebarCollapsed: true },
        updatedAt: '2026-04-18T00:00:00.000Z',
      }),
    )
    getFetchMock.mockResolvedValue({
      payload: { sidebarCollapsed: true },
      updatedAt: '2026-04-18T00:00:00.000Z',
    })

    const { getByTestId } = render(<Harness activeProjectId="project-alpha" />)

    // First-paint is synchronous — the collapsed flag reads true immediately.
    expect(getByTestId('collapsed-value').textContent).toBe('true')
  })
})
