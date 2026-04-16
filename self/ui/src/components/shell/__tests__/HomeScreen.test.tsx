// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen } from '../HomeScreen'
import * as featureFlags from '../feature-flags'

const defaultProps = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  canGoBack: false,
}

describe('HomeScreen', () => {
  it('renders without crashing with required ContentRouterRenderProps', () => {
    render(<HomeScreen {...defaultProps} />)
  })

  it('accepts optional greeting and recentActivity props', () => {
    render(
      <HomeScreen
        {...defaultProps}
        greeting="Hello!"
        recentActivity={[{ id: 'a1', label: 'Test activity' }]}
      />,
    )
  })

  it('renders greeting section with time-of-day text', () => {
    render(<HomeScreen {...defaultProps} />)
    // Should contain one of the time-of-day greetings + ", User"
    const greeting = screen.getByRole('heading', { level: 2 })
    expect(greeting.textContent).toMatch(/(Good morning|Good afternoon|Good evening), User/)
  })

  it('renders recent activity stub items', () => {
    render(<HomeScreen {...defaultProps} />)
    // Default stub items
    expect(screen.getByText('Updated project roadmap')).toBeTruthy()
    expect(screen.getByText('Reviewed agent dispatch logs')).toBeTruthy()
    expect(screen.getByText('Completed skill configuration')).toBeTruthy()
  })

  it('renders quick action buttons when feature flag is off', () => {
    vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(false)
    render(<HomeScreen {...defaultProps} />)
    expect(screen.getByText('Threads')).toBeTruthy()
    expect(screen.getByText('Workflows')).toBeTruthy()
    expect(screen.getByText('Skills')).toBeTruthy()
    vi.restoreAllMocks()
  })

  it('clicking a quick action button calls navigate() with the correct route ID', () => {
    vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(false)
    const navigate = vi.fn()
    render(<HomeScreen {...defaultProps} navigate={navigate} />)

    fireEvent.click(screen.getByText('Workflows'))
    expect(navigate).toHaveBeenCalledWith('workflows')

    fireEvent.click(screen.getByText('Threads'))
    expect(navigate).toHaveBeenCalledWith('threads')

    fireEvent.click(screen.getByText('Skills'))
    expect(navigate).toHaveBeenCalledWith('skills')
    vi.restoreAllMocks()
  })

  it('custom greeting overrides time-of-day greeting', () => {
    render(<HomeScreen {...defaultProps} greeting="Welcome back" />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Welcome back, User')
  })

  it('empty recentActivity array renders without error', () => {
    render(<HomeScreen {...defaultProps} recentActivity={[]} />)
    // Should render the section header but no items
    expect(screen.getByText('Recent Activity')).toBeTruthy()
  })

  // ── Home sidebar feature flag tests ────────────────────────────────────

  describe('when home sidebar feature flag is ON', () => {
    beforeEach(() => {
      vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(true)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('hides quick actions section', () => {
      render(<HomeScreen {...defaultProps} />)
      expect(screen.queryByText('Quick Actions')).toBeNull()
      expect(screen.queryByText('Threads')).toBeNull()
      expect(screen.queryByText('Workflows')).toBeNull()
      expect(screen.queryByText('Skills')).toBeNull()
    })

    it('still renders greeting and recent activity', () => {
      render(<HomeScreen {...defaultProps} />)
      const heading = screen.getByRole('heading', { level: 2 })
      expect(heading.textContent).toMatch(/(Good morning|Good afternoon|Good evening), User/)
      expect(screen.getByText('Recent Activity')).toBeTruthy()
    })
  })

  describe('when home sidebar feature flag is OFF', () => {
    beforeEach(() => {
      vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(false)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders quick actions section', () => {
      render(<HomeScreen {...defaultProps} />)
      expect(screen.getByText('Quick Actions')).toBeTruthy()
      expect(screen.getByText('Threads')).toBeTruthy()
      expect(screen.getByText('Workflows')).toBeTruthy()
      expect(screen.getByText('Skills')).toBeTruthy()
    })
  })
})
