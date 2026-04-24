// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArchiveFlow, deriveMruActivePeer } from '../useArchiveFlow'
import type { ProjectItem } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

/**
 * Test harness — renders a hook-only component and exposes the API via ref.
 */
function renderHook(args: Parameters<typeof useArchiveFlow>[0]) {
  const apiRef: { current: ReturnType<typeof useArchiveFlow> | null } = { current: null }
  function Probe() {
    apiRef.current = useArchiveFlow(args)
    return null
  }
  return { apiRef, element: <Probe /> }
}

describe('Phase 1.3 — useArchiveFlow state machine (Goals C8, INV-11)', () => {
  it('archive non-active project → onArchive fires; no active-switch', async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()
    const onCreateDefault = vi.fn()

    const projects: ProjectItem[] = [
      { id: 'proj-active', name: 'Active' },
      { id: 'proj-other', name: 'Other' },
    ]
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects,
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault,
      onProjectChange,
      onNavigateHome,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.archive('proj-other') })

    expect(onArchive).toHaveBeenCalledWith('proj-other')
    expect(onProjectChange).not.toHaveBeenCalled()
    expect(onNavigateHome).not.toHaveBeenCalled()
    expect(onCreateDefault).not.toHaveBeenCalled()
  })

  it('archive active project with peers → peer-switch branch fires in order', async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()
    const onCreateDefault = vi.fn()

    const projects: ProjectItem[] = [
      { id: 'proj-active', name: 'Active' },
      { id: 'proj-x', name: 'X' }, // lex-smallest peer (deterministic tie-break)
      { id: 'proj-y', name: 'Y' },
    ]
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects,
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault,
      onProjectChange,
      onNavigateHome,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.archive('proj-active') })

    expect(onArchive).toHaveBeenCalledWith('proj-active')
    // Deterministic lex tie-break → smallest peer id.
    expect(onProjectChange).toHaveBeenCalledWith('proj-x')
    expect(onNavigateHome).toHaveBeenCalled()
    expect(onCreateDefault).not.toHaveBeenCalled()
  })

  it('archive active project with no peers → auto-create-default branch fires in order', async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()
    const onCreateDefault = vi.fn().mockResolvedValue({ id: 'proj-new-default' })

    const projects: ProjectItem[] = [
      { id: 'proj-active', name: 'Active' },
    ]
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects,
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault,
      onProjectChange,
      onNavigateHome,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.archive('proj-active') })

    expect(onArchive).toHaveBeenCalledWith('proj-active')
    expect(onCreateDefault).toHaveBeenCalled()
    expect(onProjectChange).toHaveBeenCalledWith('proj-new-default')
    expect(onNavigateHome).toHaveBeenCalled()
  })

  it('onArchive rejects → onError fires; no side effects', async () => {
    const boom = new Error('archive failed')
    const onArchive = vi.fn().mockRejectedValue(boom)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()
    const onError = vi.fn()

    const projects: ProjectItem[] = [
      { id: 'proj-active', name: 'Active' },
      { id: 'proj-other', name: 'Other' },
    ]
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects,
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault: vi.fn(),
      onProjectChange,
      onNavigateHome,
      onError,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.archive('proj-active') })

    expect(onError).toHaveBeenCalledWith(boom, 'archive')
    expect(onProjectChange).not.toHaveBeenCalled()
    expect(onNavigateHome).not.toHaveBeenCalled()
  })

  it('onCreateDefault rejects after onArchive succeeds → onError fires; onProjectChange not called', async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined)
    const boom = new Error('create failed')
    const onCreateDefault = vi.fn().mockRejectedValue(boom)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()
    const onError = vi.fn()

    const projects: ProjectItem[] = [{ id: 'proj-active', name: 'Active' }]
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects,
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault,
      onProjectChange,
      onNavigateHome,
      onError,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.archive('proj-active') })

    expect(onArchive).toHaveBeenCalled()
    expect(onCreateDefault).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(boom, 'archive')
    expect(onProjectChange).not.toHaveBeenCalled()
    expect(onNavigateHome).not.toHaveBeenCalled()
  })

  it('unarchive invokes onUnarchive with no active-switch side effects', async () => {
    const onUnarchive = vi.fn().mockResolvedValue(undefined)
    const onProjectChange = vi.fn()
    const onNavigateHome = vi.fn()

    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-active',
      projects: [{ id: 'proj-active', name: 'A' }],
      onArchive: vi.fn(),
      onUnarchive,
      onCreateDefault: vi.fn(),
      onProjectChange,
      onNavigateHome,
    })

    await act(async () => { root.render(element); await flush() })
    await act(async () => { await apiRef.current?.unarchive('proj-archived') })

    expect(onUnarchive).toHaveBeenCalledWith('proj-archived')
    expect(onProjectChange).not.toHaveBeenCalled()
    expect(onNavigateHome).not.toHaveBeenCalled()
  })

  it('isRunning reflects flight state and blocks overlapping invocations', async () => {
    let resolveIt: () => void = () => {}
    const onArchive = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveIt = resolve
        }),
    )
    const { apiRef, element } = renderHook({
      activeProjectId: 'proj-a',
      projects: [{ id: 'proj-a', name: 'A' }, { id: 'proj-b', name: 'B' }],
      onArchive,
      onUnarchive: vi.fn(),
      onCreateDefault: vi.fn(),
      onProjectChange: vi.fn(),
      onNavigateHome: vi.fn(),
    })

    await act(async () => { root.render(element); await flush() })

    // Kick off the first archive but don't await yet.
    let first: Promise<void> = Promise.resolve()
    await act(async () => {
      first = apiRef.current!.archive('proj-b')
      await flush()
    })

    // Attempt a second invocation while first is in flight.
    await act(async () => {
      await apiRef.current!.archive('proj-a')
      await flush()
    })

    // onArchive should have been called exactly once (second call blocked).
    expect(onArchive).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveIt()
      await first
      await flush()
    })
  })
})

describe('deriveMruActivePeer (INV-11)', () => {
  const projects: ProjectItem[] = [
    { id: 'zeta', name: 'Z' },
    { id: 'alpha', name: 'A' },
    { id: 'beta', name: 'B' },
    { id: 'archived', name: 'Archived', archived: true },
  ]

  it('returns null when no peers remain', () => {
    expect(
      deriveMruActivePeer({
        archivedProjectId: 'alpha',
        allProjects: [
          { id: 'alpha', name: 'A' },
          { id: 'archived', name: 'X', archived: true },
        ],
      }),
    ).toBeNull()
  })

  it('returns lex-smallest peer with empty navigationHistory', () => {
    expect(
      deriveMruActivePeer({
        archivedProjectId: 'zeta',
        allProjects: projects,
        navigationHistory: [],
      }),
    ).toBe('alpha')
  })

  it('returns lex-smallest peer with undefined navigationHistory', () => {
    expect(
      deriveMruActivePeer({
        archivedProjectId: 'zeta',
        allProjects: projects,
      }),
    ).toBe('alpha')
  })

  it('returns lex-smallest peer even when history references peers (V1 posture)', () => {
    // V1 intentionally ignores cross-project history — navigationHistory is
    // per-project, not cross-project (SDS Decision E). Deterministic output.
    expect(
      deriveMruActivePeer({
        archivedProjectId: 'zeta',
        allProjects: projects,
        navigationHistory: ['beta', 'alpha', 'beta'],
      }),
    ).toBe('alpha')
  })

  it('excludes the project being archived from the peer set', () => {
    expect(
      deriveMruActivePeer({
        archivedProjectId: 'alpha',
        allProjects: projects,
      }),
    ).toBe('beta')
  })
})
