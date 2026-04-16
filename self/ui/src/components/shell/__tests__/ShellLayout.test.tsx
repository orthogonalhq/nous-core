// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShellLayout } from '../ShellLayout'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderLayout(
  overrides: Partial<React.ComponentProps<typeof ShellLayout>> = {},
) {
  await act(async () => {
    root.render(
      <ShellLayout
        rail={<div>rail</div>}
        chat={<div>chat</div>}
        content={<div>content</div>}
        observe={<div>observe</div>}
        {...overrides}
      />,
    )
    await flush()
  })
}

function getArea(name: string): HTMLDivElement {
  const element = container.querySelector(`[data-shell-area="${name}"]`)

  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`Area not found: ${name}`)
  }

  return element
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

describe('ShellLayout', () => {
  it('renders all four named grid areas', async () => {
    await renderLayout()

    expect(getArea('rail').textContent).toContain('rail')
    expect(getArea('chat').textContent).toContain('chat')
    expect(getArea('content').textContent).toContain('content')
    expect(getArea('observe').textContent).toContain('observe')
  })

  it('hides the observe area at medium and hides chat plus observe at narrow', async () => {
    await renderLayout({ breakpoint: 'medium' })
    expect(getArea('observe').style.display).toBe('none')
    expect(getArea('chat').style.display).toBe('block')

    await renderLayout({ breakpoint: 'narrow' })
    expect(getArea('observe').style.display).toBe('none')
    expect(getArea('chat').style.display).toBe('none')
  })

  it('applies initial widths as CSS custom properties', async () => {
    await renderLayout({
      initialWidths: {
        chat: 360,
        observe: 300,
      },
    })

    const layout = container.firstElementChild

    if (!(layout instanceof HTMLDivElement)) {
      throw new Error('Shell layout root not found')
    }

    expect(layout.style.getPropertyValue('--shell-chat-width')).toBe('360px')
    expect(layout.style.getPropertyValue('--shell-observe-width')).toBe('300px')
  })
})
