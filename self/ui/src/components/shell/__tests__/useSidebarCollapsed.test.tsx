// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarCollapsed } from '../useSidebarCollapsed'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

// Harness exposes the hook's current value via data-testid and exposes the
// setter via an imperative button so tests can invoke it inside `act`.
function Harness({ setterValue }: { setterValue?: boolean }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  return (
    <div>
      <span data-testid="collapsed-value">{String(collapsed)}</span>
      <button
        type="button"
        data-testid="set-button"
        onClick={() => setCollapsed(setterValue ?? true)}
      >
        set
      </button>
    </div>
  )
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  localStorage.clear()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
  vi.restoreAllMocks()
})

describe('useSidebarCollapsed', () => {
  it('returns [false, setter] on first mount when localStorage is empty', async () => {
    await act(async () => {
      root.render(<Harness />)
      await flush()
    })
    const value = container.querySelector('[data-testid="collapsed-value"]')
    expect(value?.textContent).toBe('false')
  })

  it('returns [true, setter] on first mount when localStorage has the literal "true"', async () => {
    localStorage.setItem('nous-asset-sidebar-collapsed', 'true')
    await act(async () => {
      root.render(<Harness />)
      await flush()
    })
    const value = container.querySelector('[data-testid="collapsed-value"]')
    expect(value?.textContent).toBe('true')
  })

  it('setter writes "true" to localStorage when called with true', async () => {
    await act(async () => {
      root.render(<Harness setterValue={true} />)
      await flush()
    })
    const button = container.querySelector('[data-testid="set-button"]') as HTMLButtonElement
    await act(async () => {
      button.click()
      await flush()
    })
    expect(localStorage.getItem('nous-asset-sidebar-collapsed')).toBe('true')
  })

  it('setter writes "false" to localStorage when called with false', async () => {
    localStorage.setItem('nous-asset-sidebar-collapsed', 'true')
    await act(async () => {
      root.render(<Harness setterValue={false} />)
      await flush()
    })
    const button = container.querySelector('[data-testid="set-button"]') as HTMLButtonElement
    await act(async () => {
      button.click()
      await flush()
    })
    expect(localStorage.getItem('nous-asset-sidebar-collapsed')).toBe('false')
  })

  it('returns false when localStorage.getItem throws (privacy mode / SSR)', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('privacy mode')
    })
    await act(async () => {
      root.render(<Harness />)
      await flush()
    })
    const value = container.querySelector('[data-testid="collapsed-value"]')
    expect(value?.textContent).toBe('false')
    expect(getItemSpy).toHaveBeenCalled()
  })

  it('does not re-throw when localStorage.setItem throws (quota exceeded)', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    await act(async () => {
      root.render(<Harness setterValue={true} />)
      await flush()
    })
    const button = container.querySelector('[data-testid="set-button"]') as HTMLButtonElement
    // The setter click triggers a state change → useEffect calls setItem, which throws.
    // The hook must swallow the throw; the component stays mounted.
    await act(async () => {
      button.click()
      await flush()
    })
    expect(setItemSpy).toHaveBeenCalled()
    // Harness is still rendered and reflects the new state in-memory
    const value = container.querySelector('[data-testid="collapsed-value"]')
    expect(value?.textContent).toBe('true')
  })

  it('treats non-boolean stored values as false (strict equality against "true")', async () => {
    // Uppercase "TRUE" is not strictly equal to "true" → reads as false
    localStorage.setItem('nous-asset-sidebar-collapsed', 'TRUE')
    await act(async () => {
      root.render(<Harness />)
      await flush()
    })
    const value = container.querySelector('[data-testid="collapsed-value"]')
    expect(value?.textContent).toBe('false')
  })
})
