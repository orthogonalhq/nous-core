// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColumnDivider } from '../ColumnDivider'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderDivider(onResize = vi.fn()) {
  await act(async () => {
    root.render(<ColumnDivider onResize={onResize} />)
    await flush()
  })

  return onResize
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

describe('ColumnDivider', () => {
  it('renders without crashing', async () => {
    await renderDivider()

    expect(container.querySelector('.nous-column-divider')).not.toBeNull()
  })

  it('reports the drag delta through onResize', async () => {
    const onResize = await renderDivider()
    const divider = container.querySelector('.nous-column-divider')

    if (!(divider instanceof HTMLDivElement)) {
      throw new Error('Divider not found')
    }

    await act(async () => {
      divider.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }),
      )
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 140 }),
      )
      document.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 140 }),
      )
      await flush()
    })

    expect(onResize).toHaveBeenCalledWith(40)
  })

  it('reports incremental deltas on consecutive moves', async () => {
    const onResize = await renderDivider()
    const divider = container.querySelector('.nous-column-divider')

    if (!(divider instanceof HTMLDivElement)) {
      throw new Error('Divider not found')
    }

    await act(async () => {
      divider.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }),
      )
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 120 }),
      )
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 150 }),
      )
      document.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 150 }),
      )
      await flush()
    })

    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenNthCalledWith(1, 20)
    expect(onResize).toHaveBeenNthCalledWith(2, 30)
  })

  it('ignores non-finite drag deltas', async () => {
    const onResize = await renderDivider()
    const divider = container.querySelector('.nous-column-divider')

    if (!(divider instanceof HTMLDivElement)) {
      throw new Error('Divider not found')
    }

    const invalidMoveEvent = new Event('pointermove', { bubbles: true })
    Object.defineProperty(invalidMoveEvent, 'clientX', {
      value: Number.NaN,
    })

    await act(async () => {
      divider.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }),
      )
      document.dispatchEvent(invalidMoveEvent)
      document.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 100 }),
      )
      await flush()
    })

    expect(onResize).not.toHaveBeenCalled()
  })
})
