// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ObservePanel } from '../ObservePanel'
import { ShellProvider } from '../ShellContext'

describe('ObservePanel', () => {
  it('renders without crashing when wrapped in ShellProvider', () => {
    render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
  })

  it('accepts ObservePanelProps (maoApi, className)', () => {
    const mockApi = {
      getAgentProjections: async () => [],
      getProjectControlProjection: async () => null,
      requestProjectControl: async () => ({}),
    }
    render(
      <ShellProvider>
        <ObservePanel maoApi={mockApi} className="test-class" />
      </ShellProvider>,
    )
  })

  it('renders MAOSurface when activeRoute is workflows', () => {
    render(
      <ShellProvider activeRoute="workflows">
        <ObservePanel />
      </ShellProvider>,
    )
    // MAOPanel renders "MAO — Agent Cycle" header
    expect(screen.getByText('MAO — Agent Cycle')).toBeTruthy()
  })

  it('renders MAOSurface when activeRoute is workflow-detail', () => {
    render(
      <ShellProvider activeRoute="workflow-detail">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('MAO — Agent Cycle')).toBeTruthy()
  })

  it('renders default placeholder when activeRoute is home', () => {
    render(
      <ShellProvider activeRoute="home">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('No observe content for this view')).toBeTruthy()
  })

  it('renders default placeholder when activeRoute is skills', () => {
    render(
      <ShellProvider activeRoute="skills">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('No observe content for this view')).toBeTruthy()
  })

  it('passes maoApi prop through to MAOSurface', () => {
    const mockApi = {
      getAgentProjections: async () => [],
      getProjectControlProjection: async () => null,
      requestProjectControl: async () => ({}),
    }
    render(
      <ShellProvider activeRoute="workflows">
        <ObservePanel maoApi={mockApi} />
      </ShellProvider>,
    )
    // MAOPanel renders when maoApi provided
    expect(screen.getByText('MAO — Agent Cycle')).toBeTruthy()
  })
})
