// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ContentRouter,
  type ContentRouterRenderProps,
} from '../ContentRouter'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function HomeRoute({ navigate }: ContentRouterRenderProps) {
  return (
    <button type="button" onClick={() => navigate('details')}>
      Open details
    </button>
  )
}

function DetailsRoute() {
  return <div>Details screen</div>
}

function ParamRoute({ params }: ContentRouterRenderProps) {
  return <div data-testid="param-route">Param: {params?.definitionId as string ?? 'none'}</div>
}

const routes = {
  home: HomeRoute,
  details: DetailsRoute,
  'workflow-detail': ParamRoute,
}

async function renderRouter(
  overrides: Partial<React.ComponentProps<typeof ContentRouter>> = {},
) {
  await act(async () => {
    root.render(
      <ContentRouter
        activeRoute="home"
        routes={routes}
        {...overrides}
      />,
    )
    await flush()
  })
}

function getButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.includes(text),
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`)
  }

  return button
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

describe('ContentRouter', () => {
  it('renders the component matching the active route', async () => {
    await renderRouter()

    expect(container.textContent).toContain('Open details')
  })

  it('navigates forward and back while notifying onNavigate', async () => {
    const onNavigate = vi.fn()

    await renderRouter({ onNavigate })

    await act(async () => {
      getButtonByText('Open details').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      await flush()
    })

    expect(container.textContent).toContain('Details screen')
    expect(onNavigate).toHaveBeenCalledWith('details')

    await act(async () => {
      getButtonByText('Back').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      await flush()
    })

    expect(container.textContent).toContain('Open details')
    expect(onNavigate).toHaveBeenCalledWith('home', undefined)
  })

  it('renders nothing when the active route is unknown', async () => {
    await renderRouter({
      activeRoute: 'missing',
    })

    expect(container.textContent?.trim()).toBe('')
  })

  it('pushes distinct stack entries for same route with different params', async () => {
    const onNavigate = vi.fn()

    // Render with workflow-detail and params A
    await renderRouter({
      activeRoute: 'workflow-detail',
      navigationParams: { definitionId: 'a' },
      onNavigate,
    })

    expect(container.textContent).toContain('Param: a')

    // Re-render with same route but different params
    await act(async () => {
      root.render(
        <ContentRouter
          activeRoute="workflow-detail"
          navigationParams={{ definitionId: 'b' }}
          routes={routes}
          onNavigate={onNavigate}
        />,
      )
      await flush()
    })

    expect(container.textContent).toContain('Param: b')

    // Back button should appear (stack has 2 entries)
    const backButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Back'),
    )
    expect(backButton).toBeTruthy()

    // Click Back
    await act(async () => {
      backButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    // Should restore params A
    expect(container.textContent).toContain('Param: a')
    expect(onNavigate).toHaveBeenCalledWith('workflow-detail', { definitionId: 'a' })
  })

  it('does not push duplicate when route and params both match', async () => {
    const onNavigate = vi.fn()

    await renderRouter({
      activeRoute: 'workflow-detail',
      navigationParams: { definitionId: 'a' },
      onNavigate,
    })

    // Re-render with identical route and params
    await act(async () => {
      root.render(
        <ContentRouter
          activeRoute="workflow-detail"
          navigationParams={{ definitionId: 'a' }}
          routes={routes}
          onNavigate={onNavigate}
        />,
      )
      await flush()
    })

    // Back button should NOT appear (stack did not grow)
    const backButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Back'),
    )
    expect(backButton).toBeFalsy()
  })

  it('goBack on single-entry stack is a no-op', async () => {
    const onNavigate = vi.fn()

    await renderRouter({ onNavigate })

    // No back button should be present
    const backButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Back'),
    )
    expect(backButton).toBeFalsy()
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
