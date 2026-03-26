// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RouteSkeleton } from '@/components/shell/route-skeleton'

describe('RouteSkeleton', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders without crashing', () => {
    render(<RouteSkeleton />)
    expect(screen.getByTestId('route-skeleton')).toBeDefined()
  })

  it('contains pulsing skeleton elements', () => {
    render(<RouteSkeleton />)
    const container = screen.getByTestId('route-skeleton')
    // Should have 4 skeleton bar divs (1 title + 3 content bars)
    const children = container.querySelectorAll('div')
    expect(children.length).toBeGreaterThanOrEqual(4)
  })
})
