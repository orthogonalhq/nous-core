// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShellProvider, useShellContext } from '../ShellContext'
import type { ObserveTab } from '../types'

function ShellContextConsumer() {
  const context = useShellContext()

  return (
    <div>
      {context.mode}|{context.breakpoint}|{context.activeRoute}|{context.conversation.tier}
    </div>
  )
}

describe('ShellContext', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderToStaticMarkup(<ShellContextConsumer />)).toThrow(
      'useShellContext must be used within ShellProvider',
    )
  })

  it('provides context values to children', () => {
    const markup = renderToStaticMarkup(
      <ShellProvider
        mode="developer"
        breakpoint="medium"
        activeRoute="catalog"
        conversation={{
          tier: 'thread',
          threadId: 'thread-1',
          projectId: null,
          isAmbient: false,
        }}
      >
        <ShellContextConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('developer|medium|catalog|thread')
  })

  it('provides onProjectChange callback when specified', () => {
    const onProjectChange = (id: string) => id

    function ProjectChangeConsumer() {
      const context = useShellContext()
      return <div>{typeof context.onProjectChange}</div>
    }

    const markup = renderToStaticMarkup(
      <ShellProvider onProjectChange={onProjectChange}>
        <ProjectChangeConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('function')
  })

  it('does not include onProjectChange when not provided', () => {
    function ProjectChangeConsumer() {
      const context = useShellContext()
      return <div>{String(context.onProjectChange)}</div>
    }

    const markup = renderToStaticMarkup(
      <ShellProvider>
        <ProjectChangeConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('undefined')
  })
})

// ---------------------------------------------------------------------------
// SP 11 SUPV-SP11-003 — uncontrolled `useState` for activeObserveTab and
// observePanelCollapsed. Internal state is the canonical source; the
// host-provided value props seed initial state on mount.
// ---------------------------------------------------------------------------

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

describe('ShellContext — SP 11 runtime fields', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  function ActiveTabConsumer() {
    const ctx = useShellContext()
    return <div data-testid="active-tab">{ctx.activeObserveTab}</div>
  }

  function CollapsedConsumer() {
    const ctx = useShellContext()
    return <div data-testid="collapsed">{String(ctx.observePanelCollapsed)}</div>
  }

  function SetterTabConsumer({ tab }: { tab: ObserveTab }) {
    const ctx = useShellContext()
    React.useEffect(() => {
      ctx.setActiveObserveTab(tab)
    }, [ctx, tab])
    return <div data-testid="active-tab">{ctx.activeObserveTab}</div>
  }

  function SetterCollapsedConsumer({ value }: { value: boolean }) {
    const ctx = useShellContext()
    React.useEffect(() => {
      ctx.setObservePanelCollapsed(value)
    }, [ctx, value])
    return <div data-testid="collapsed">{String(ctx.observePanelCollapsed)}</div>
  }

  it("UT-SP11-CTX-DEFAULT-ACTIVE-TAB — defaults activeObserveTab to 'agents'", async () => {
    await act(async () => {
      root.render(
        <ShellProvider>
          <ActiveTabConsumer />
        </ShellProvider>,
      )
    })
    expect(container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('agents')
  })

  it('UT-SP11-CTX-SETTER-ACTIVE-TAB — setActiveObserveTab updates the context value', async () => {
    await act(async () => {
      root.render(
        <ShellProvider>
          <SetterTabConsumer tab="system-load" />
        </ShellProvider>,
      )
    })
    expect(container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('system-load')
  })

  it('UT-SP11-CTX-DEFAULT-COLLAPSED — defaults observePanelCollapsed to false', async () => {
    await act(async () => {
      root.render(
        <ShellProvider>
          <CollapsedConsumer />
        </ShellProvider>,
      )
    })
    expect(container.querySelector('[data-testid="collapsed"]')?.textContent).toBe('false')
  })

  it('UT-SP11-CTX-SETTER-COLLAPSED — setObservePanelCollapsed updates the context value', async () => {
    await act(async () => {
      root.render(
        <ShellProvider>
          <SetterCollapsedConsumer value={true} />
        </ShellProvider>,
      )
    })
    expect(container.querySelector('[data-testid="collapsed"]')?.textContent).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// Phase 1.17 SUPV-SP1.17-004 — RC-B3 contract identity-stability test for
// ShellContext `value`. Validates that the value reference is stable across
// no-input-change parent re-renders (consumers behind React.memo would still
// re-render due to context broadcast — but value identity stability is the
// load-bearing contract for downstream useMemo/useEffect deps that read the
// value object).
// ---------------------------------------------------------------------------

describe('ShellContext — Phase 1.17 SUPV-SP1.17-004 RC-B3 value identity stability', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  function ValueRefCapture({ refs }: { refs: unknown[] }) {
    const ctx = useShellContext()
    refs.push(ctx)
    return <div data-testid="bp">{ctx.breakpoint}</div>
  }

  it('Phase 1.17 SUPV-SP1.17-004: ShellContext value identity is stable when no observed input has changed', async () => {
    const refs: unknown[] = []
    await act(async () => {
      root.render(
        <ShellProvider mode="simple" breakpoint="full" activeRoute="home">
          <ValueRefCapture refs={refs} />
        </ShellProvider>,
      )
    })

    expect(refs.length).toBeGreaterThanOrEqual(1)
    const firstRef = refs[refs.length - 1]

    // Re-render the parent with the SAME props (no observed input changed).
    await act(async () => {
      root.render(
        <ShellProvider mode="simple" breakpoint="full" activeRoute="home">
          <ValueRefCapture refs={refs} />
        </ShellProvider>,
      )
    })

    const latestRef = refs[refs.length - 1]
    expect(latestRef).toBe(firstRef)
  })

  it('Phase 1.17 SUPV-SP1.17-004: ShellContext value identity changes and consumer reads new scalar when breakpoint changes', async () => {
    const refs: unknown[] = []
    await act(async () => {
      root.render(
        <ShellProvider mode="simple" breakpoint="full" activeRoute="home">
          <ValueRefCapture refs={refs} />
        </ShellProvider>,
      )
    })
    const firstRef = refs[refs.length - 1]
    expect(container.querySelector('[data-testid="bp"]')?.textContent).toBe('full')

    await act(async () => {
      root.render(
        <ShellProvider mode="simple" breakpoint="medium" activeRoute="home">
          <ValueRefCapture refs={refs} />
        </ShellProvider>,
      )
    })
    const latestRef = refs[refs.length - 1]
    expect(latestRef).not.toBe(firstRef)
    expect(container.querySelector('[data-testid="bp"]')?.textContent).toBe('medium')
  })
})

// ---------------------------------------------------------------------------
// Phase 1.17 SUPV-SP1.17-008 — RC-B3 host-prop-forwarding regression test.
// Validates that the `useCallback` dep array on the resolved setters includes
// the host-passed setter prop, so re-passing a new function reference is
// observed at the next call. Preserves SP 11 SUPV-SP11-003 contract.
// ---------------------------------------------------------------------------

describe('ShellContext — Phase 1.17 SUPV-SP1.17-008 host-prop forwarding regression', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  function ManualTabSetterConsumer({ onReady }: { onReady: (fn: (t: ObserveTab) => void) => void }) {
    const ctx = useShellContext()
    React.useEffect(() => {
      onReady(ctx.setActiveObserveTab)
    }, [ctx.setActiveObserveTab, onReady])
    return null
  }

  function ManualCollapsedSetterConsumer({ onReady }: { onReady: (fn: (v: boolean) => void) => void }) {
    const ctx = useShellContext()
    React.useEffect(() => {
      onReady(ctx.setObservePanelCollapsed)
    }, [ctx.setObservePanelCollapsed, onReady])
    return null
  }

  it('Phase 1.17 SUPV-SP1.17-008: setActiveObserveTab forwards to the latest host-provided setter prop', async () => {
    const calls: { which: 'A' | 'B'; tab: ObserveTab }[] = []
    const spyA = (tab: ObserveTab) => calls.push({ which: 'A', tab })
    const spyB = (tab: ObserveTab) => calls.push({ which: 'B', tab })

    let latestSetter: ((t: ObserveTab) => void) | null = null
    const onReady = (fn: (t: ObserveTab) => void) => {
      latestSetter = fn
    }

    await act(async () => {
      root.render(
        <ShellProvider setActiveObserveTab={spyA}>
          <ManualTabSetterConsumer onReady={onReady} />
        </ShellProvider>,
      )
    })

    await act(async () => {
      latestSetter?.('agents')
    })
    expect(calls).toEqual([{ which: 'A', tab: 'agents' }])

    // Re-render with a different host setter; the resolved `setActiveObserveTab`
    // identity must change because `setActiveObserveTabProp` is in the
    // useCallback deps.
    await act(async () => {
      root.render(
        <ShellProvider setActiveObserveTab={spyB}>
          <ManualTabSetterConsumer onReady={onReady} />
        </ShellProvider>,
      )
    })

    await act(async () => {
      latestSetter?.('system-load')
    })

    const aCalls = calls.filter((c) => c.which === 'A')
    const bCalls = calls.filter((c) => c.which === 'B')
    expect(aCalls).toHaveLength(1)
    expect(bCalls).toEqual([{ which: 'B', tab: 'system-load' }])
  })

  it('Phase 1.17 SUPV-SP1.17-008: setObservePanelCollapsed forwards to the latest host-provided setter prop', async () => {
    const calls: { which: 'A' | 'B'; v: boolean }[] = []
    const spyA = (v: boolean) => calls.push({ which: 'A', v })
    const spyB = (v: boolean) => calls.push({ which: 'B', v })

    let latestSetter: ((v: boolean) => void) | null = null
    const onReady = (fn: (v: boolean) => void) => {
      latestSetter = fn
    }

    await act(async () => {
      root.render(
        <ShellProvider setObservePanelCollapsed={spyA}>
          <ManualCollapsedSetterConsumer onReady={onReady} />
        </ShellProvider>,
      )
    })

    await act(async () => {
      latestSetter?.(true)
    })
    expect(calls).toEqual([{ which: 'A', v: true }])

    await act(async () => {
      root.render(
        <ShellProvider setObservePanelCollapsed={spyB}>
          <ManualCollapsedSetterConsumer onReady={onReady} />
        </ShellProvider>,
      )
    })

    await act(async () => {
      latestSetter?.(false)
    })

    const aCalls = calls.filter((c) => c.which === 'A')
    const bCalls = calls.filter((c) => c.which === 'B')
    expect(aCalls).toHaveLength(1)
    expect(bCalls).toEqual([{ which: 'B', v: false }])
  })
})
