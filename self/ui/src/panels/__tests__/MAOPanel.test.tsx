// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MAOPanel } from '../MAOPanel'
import type { MaoApi, AgentCycleEntry, MAOPanelCoreProps } from '../MAOPanel'

describe('MAOPanel', () => {
  // Tier 1 — Contract
  it('renders with MAOPanelCoreProps (without dockview wrapper) without crashing', () => {
    render(<MAOPanel />)
  })

  it('exports MaoApi, AgentCycleEntry, and MAOPanelCoreProps types', () => {
    const _api: MaoApi | undefined = undefined
    const _entry: AgentCycleEntry | undefined = undefined
    const _props: MAOPanelCoreProps | undefined = undefined
    expect(_api).toBeUndefined()
    expect(_entry).toBeUndefined()
    expect(_props).toBeUndefined()
  })

  // Tier 2 — Behavior
  it('renders demo state entries when no maoApi provided', () => {
    render(<MAOPanel />)
    expect(screen.getByText('MAO — Agent Cycle')).toBeTruthy()
    expect(screen.getByText('nous-orchestrator')).toBeTruthy()
    expect(screen.getByText('nous-worker-impl')).toBeTruthy()
  })

  it('accepts hostingContext prop without error', () => {
    render(<MAOPanel hostingContext="observe-child" />)
    expect(screen.getByText('MAO — Agent Cycle')).toBeTruthy()
  })

  // Tier 3 — Edge cases
  it('renders with dockview-style { params: { maoApi, entries } } props', () => {
    const entries: AgentCycleEntry[] = [
      { agent: 'test-agent', role: 'worker', state: 'active', cycle: 1 },
    ]
    // Cast to any: dockview IDockviewPanelProps also requires api/containerApi which we cannot construct in unit tests
    render(<MAOPanel {...{ params: { entries } } as any} />)
    expect(screen.getByText('test-agent')).toBeTruthy()
  })

  it('renders identically with and without hostingContext (stub verification)', () => {
    const { container: withoutContext } = render(<MAOPanel />)
    const textWithout = withoutContext.textContent

    const { container: withContext } = render(<MAOPanel hostingContext="observe-child" />)
    const textWith = withContext.textContent

    expect(textWithout).toBe(textWith)
  })
})
