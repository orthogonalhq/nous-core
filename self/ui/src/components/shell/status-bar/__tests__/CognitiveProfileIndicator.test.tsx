// @vitest-environment jsdom

import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CognitiveProfileIndicator, formatModelId } from '../CognitiveProfileIndicator'
import { ShellProvider } from '../../ShellContext'

const mockProjectsGetUseQuery = vi.fn<(input: unknown, opts?: unknown) => unknown>()

vi.mock('@nous/transport', () => ({
  trpc: {
    projects: {
      get: {
        useQuery: (input: unknown, opts?: unknown) => mockProjectsGetUseQuery(input, opts),
      },
    },
  },
}))

beforeEach(() => {
  mockProjectsGetUseQuery.mockReset()
  mockProjectsGetUseQuery.mockReturnValue({ data: undefined })
})

/**
 * WR-162 SP 12 (SUPV-SP12-007 + SUPV-SP12-011 + SUPV-SP12-012) —
 * CognitiveProfileIndicator tests.
 */
describe('CognitiveProfileIndicator', () => {
  it('UT-SP12-IND-CP-NO-PROJECT — renders "— CP" + no-project state when activeProjectId is null', () => {
    const { container } = render(
      <ShellProvider activeProjectId={null}>
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    const btn = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('no-project')
    expect(btn.textContent).toBe('— CP')
    // Verify the query was called with `enabled: false` (gated)
    const lastCall = mockProjectsGetUseQuery.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const [, opts] = lastCall as [unknown, { enabled?: boolean } | undefined]
    expect(opts?.enabled).toBe(false)
  })

  it('UT-SP12-IND-CP-CORTEX-CHAT-PRESENT — formats and renders cortex-chat assignment', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: { modelAssignments: { 'cortex-chat': 'anthropic/claude-3.5-sonnet' } },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    const btn = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('present')
    expect(btn.getAttribute('data-main-role')).toBe('cortex-chat')
    expect(btn.textContent).toBe('Claude-3.5-Sonnet')
  })

  it('UT-SP12-IND-CP-FALLTHROUGH-CORTEX-SYSTEM — falls through to cortex-system when cortex-chat absent', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: { modelAssignments: { 'cortex-system': 'gpt-4.1' } },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    const btn = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    expect(btn.getAttribute('data-main-role')).toBe('cortex-system')
    expect(btn.textContent).toBe('Gpt-4.1')
  })

  it('UT-SP12-IND-CP-FALLTHROUGH-ORCHESTRATORS — falls through to orchestrators', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: { modelAssignments: { orchestrators: 'mistral-7b' } },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    expect(
      container.querySelector('[data-indicator="cognitive-profile"]')?.getAttribute('data-main-role'),
    ).toBe('orchestrators')
  })

  it('UT-SP12-IND-CP-FALLTHROUGH-WORKERS — falls through to workers', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: { modelAssignments: { workers: 'gpt-4o-mini' } },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    expect(
      container.querySelector('[data-indicator="cognitive-profile"]')?.getAttribute('data-main-role'),
    ).toBe('workers')
  })

  it('UT-SP12-IND-CP-ALL-ABSENT — renders "— CP" + no-assignments state when modelAssignments is empty', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: { modelAssignments: {} },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    const btn = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('no-assignments')
    expect(btn.textContent).toBe('— CP')
  })

  it('UT-SP12-IND-CP-FORMATTER — pure transform for provider/model, capitalization, version preservation', () => {
    expect(formatModelId('anthropic/claude-3.5-sonnet')).toBe('Claude-3.5-Sonnet')
    expect(formatModelId('claude-3.5-sonnet')).toBe('Claude-3.5-Sonnet')
    expect(formatModelId('gpt-4.1')).toBe('Gpt-4.1')
    expect(formatModelId('mistral-7b-instruct')).toBe('Mistral-7b-Instruct')
    expect(formatModelId('openai/gpt-4o-mini')).toBe('Gpt-4o-Mini')
  })

  it('UT-SP12-IND-CP-TOOLTIP — tooltip lists every present role with formatted model id', () => {
    mockProjectsGetUseQuery.mockReturnValue({
      data: {
        modelAssignments: {
          'cortex-chat': 'anthropic/claude-3.5-sonnet',
          orchestrators: 'gpt-4o-mini',
        },
      },
    })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    const btn = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    const tooltip = btn.getAttribute('title') ?? ''
    expect(tooltip).toContain('Cortex Chat: Claude-3.5-Sonnet')
    expect(tooltip).toContain('Agent Orchitect Orchestrator: Gpt-4o-Mini')
  })

  it('UT-SP12-IND-CP-CLICK-TARGET — click invokes both setters with cost-monitor + false', () => {
    const setTab = vi.fn()
    const setCollapsed = vi.fn()
    const { container } = render(
      <ShellProvider
        activeProjectId={null}
        observePanelCollapsed={true}
        setActiveObserveTab={setTab}
        setObservePanelCollapsed={setCollapsed}
      >
        <CognitiveProfileIndicator />
      </ShellProvider>,
    )
    fireEvent.click(container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement)
    expect(setTab).toHaveBeenCalledWith('cost-monitor')
    expect(setCollapsed).toHaveBeenCalledWith(false)
  })

  it('UT-SP12-IND-CP-NEVER-READS-SNAPSHOT — component signature has no `slot` prop', () => {
    // Structural assertion: the indicator is a zero-arg function. A `slot`
    // prop addition would change the parameter list length to non-zero.
    expect(CognitiveProfileIndicator.length).toBe(0)
  })
})
