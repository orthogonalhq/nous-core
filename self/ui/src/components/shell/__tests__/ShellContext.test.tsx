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
