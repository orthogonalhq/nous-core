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

const routes = {
  home: HomeRoute,
  details: DetailsRoute,
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
    expect(onNavigate).toHaveBeenCalledWith('home')
  })

  it('renders nothing when the active route is unknown', async () => {
    await renderRouter({
      activeRoute: 'missing',
    })

    expect(container.textContent?.trim()).toBe('')
  })
})
