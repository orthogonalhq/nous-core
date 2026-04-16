// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationRail } from '../NavigationRail'
import type { ProjectItem, RailSection } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const sections: RailSection[] = [
  {
    id: 'library',
    label: 'Library',
    items: [
      { id: 'home', label: 'Home', icon: 'H' },
      { id: 'skills', label: 'Skills', icon: 'S' },
    ],
  },
]

const projects: ProjectItem[] = [
  { id: 'alpha', name: 'Alpha Project', icon: 'A' },
]

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderRail(
  overrides: Partial<React.ComponentProps<typeof NavigationRail>> = {},
) {
  await act(async () => {
    root.render(
      <NavigationRail
        items={sections}
        activeItemId="home"
        onItemSelect={() => undefined}
        {...overrides}
      />,
    )
    await flush()
  })
}

function getButtonByAriaLabel(label: string): HTMLButtonElement {
  const button = container.querySelector(`button[aria-label="${label}"]`)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`)
  }

  return button
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
  vi.restoreAllMocks()
})

describe('NavigationRail', () => {
  it('renders with minimal required props', async () => {
    await renderRail({ items: [] })

    expect(container.querySelector('.nous-navigation-rail')).not.toBeNull()
  })

  it('renders sections, marks the active item, and calls onItemSelect', async () => {
    const onItemSelect = vi.fn()

    await renderRail({ onItemSelect })

    expect(container.textContent).toContain('Library')

    const homeButton = getButtonByAriaLabel('Home')
    const skillsButton = getButtonByAriaLabel('Skills')

    expect(homeButton.classList.contains('is-active')).toBe(true)

    await act(async () => {
      skillsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(onItemSelect).toHaveBeenCalledWith('skills')
  })

  it('renders project items and calls onProjectSelect when a project is clicked', async () => {
    const onProjectSelect = vi.fn()

    await renderRail({
      projects,
      onProjectSelect,
    })

    expect(container.textContent).toContain('Projects')
    expect(container.textContent).toContain('Alpha Project')

    await act(async () => {
      getButtonByText('Alpha Project').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      await flush()
    })

    expect(onProjectSelect).toHaveBeenCalledWith('alpha')
  })
})
