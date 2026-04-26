// @vitest-environment jsdom

import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MaoDensityGrid } from '../mao-density-grid'
import type { MaoDensityMode, MaoGridTileProjection, MaoProjectSnapshot } from '@nous/shared'

function createTile(
  overrides?: Partial<MaoGridTileProjection['agent']>,
): MaoGridTileProjection {
  return {
    agent: {
      agent_id: 'agent-001',
      current_step: 'Execute task',
      dispatch_state: 'dispatched',
      state: 'running',
      risk_level: 'low',
      attention_level: 'normal',
      progress_percent: 50,
      reflection_cycle_count: 2,
      reasoning_log_preview: null,
      urgency_level: 'normal',
      workflow_run_id: 'run-001',
      workflow_node_definition_id: 'node-001',
      last_update_at: '2026-03-28T10:00:00Z',
      deepLinks: [],
      evidenceRefs: [],
      ...overrides,
    },
    inspectOnly: false,
  } as MaoGridTileProjection
}

function createSnapshot(
  densityMode: MaoDensityMode,
  tiles: MaoGridTileProjection[],
  overrides?: Partial<MaoProjectSnapshot>,
): MaoProjectSnapshot {
  return {
    projectId: 'project-001',
    densityMode,
    workflowRunId: 'run-001',
    controlProjection: {
      project_control_state: 'nominal',
      pfc_project_recommendation: 'proceed',
    },
    grid: tiles,
    graph: { nodes: [], edges: [] },
    urgentOverlay: { urgentAgentIds: [], blockedAgentIds: [] },
    summary: {
      activeAgentCount: tiles.length,
      blockedAgentCount: 0,
      completedAgentCount: 0,
      urgentAgentCount: 0,
    },
    diagnostics: { runtimePosture: 'single_process_local' },
    generatedAt: '2026-03-28T10:00:00Z',
    ...overrides,
  } as unknown as MaoProjectSnapshot
}

const noop = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MaoDensityGrid inference rendering', () => {
  it('renders full inference detail at D0 (provider, model, latency, tokens, streaming pulse)', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_model_id: 'claude-4',
      inference_latency_ms: 142,
      inference_total_tokens: 12450,
      inference_is_streaming: true,
    })
    const snapshot = createSnapshot('D0', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const section = screen.getByTestId('inference-d0')
    expect(section).toBeTruthy()
    expect(screen.getByText('anthropic')).toBeTruthy()
    expect(screen.getByText('claude-4')).toBeTruthy()
    expect(screen.getByText('142ms')).toBeTruthy()
    expect(screen.getByText('12,450 tok')).toBeTruthy()
    expect(screen.getByTestId('streaming-pulse')).toBeTruthy()
  })

  it('renders D1 detail without streaming pulse', () => {
    const tile = createTile({
      inference_provider_id: 'openai',
      inference_model_id: 'gpt-5',
      inference_latency_ms: 200,
      inference_total_tokens: 8000,
      inference_is_streaming: true,
    })
    const snapshot = createSnapshot('D1', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const section = screen.getByTestId('inference-d1')
    expect(section).toBeTruthy()
    expect(screen.getByText('openai')).toBeTruthy()
    expect(screen.getByText('gpt-5')).toBeTruthy()
    expect(screen.getByText('200ms')).toBeTruthy()
    expect(screen.getByText('8,000 tok')).toBeTruthy()
    // D1 does not show streaming pulse
    expect(screen.queryByTestId('streaming-pulse')).toBeNull()
  })

  it('renders compact view (streaming icon + tokens) at D2', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_model_id: 'claude-4',
      inference_latency_ms: 100,
      inference_total_tokens: 5000,
      inference_is_streaming: true,
    })
    const snapshot = createSnapshot('D2', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const section = screen.getByTestId('inference-d2')
    expect(section).toBeTruthy()
    expect(screen.getByTestId('streaming-pulse')).toBeTruthy()
    expect(screen.getByText('5,000 tok')).toBeTruthy()
    // D2 does not show provider or model
    expect(screen.queryByText('anthropic')).toBeNull()
    expect(screen.queryByText('claude-4')).toBeNull()
  })

  it('does not render inference data at D3', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_model_id: 'claude-4',
      inference_latency_ms: 100,
      inference_total_tokens: 5000,
      inference_is_streaming: false,
    })
    const snapshot = createSnapshot('D3', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.queryByTestId('inference-d3')).toBeNull()
    expect(screen.queryByText('anthropic')).toBeNull()
  })

  it('does not render inference data at D4', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_model_id: 'claude-4',
      inference_latency_ms: 100,
      inference_total_tokens: 5000,
      inference_is_streaming: false,
    })
    const snapshot = createSnapshot('D4', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.queryByTestId('inference-d4')).toBeNull()
    expect(screen.queryByText('anthropic')).toBeNull()
  })

  it('renders correctly when inference fields are undefined', () => {
    const tile = createTile({})
    const snapshot = createSnapshot('D0', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    // No inference section rendered
    expect(screen.queryByTestId('inference-d0')).toBeNull()
    // But the tile still renders
    expect(screen.getByText('Execute task')).toBeTruthy()
  })

  it('renders streaming pulse when inference_is_streaming is true at D0', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_is_streaming: true,
    })
    const snapshot = createSnapshot('D0', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.getByTestId('streaming-pulse')).toBeTruthy()
  })

  it('does not render streaming pulse when inference_is_streaming is false at D0', () => {
    const tile = createTile({
      inference_provider_id: 'anthropic',
      inference_is_streaming: false,
    })
    const snapshot = createSnapshot('D0', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.queryByTestId('streaming-pulse')).toBeNull()
  })
})

describe('MaoDensityGrid D3 compact tile', () => {
  it('renders compact tile at D3 with state dot and truncated label, no full card markup', () => {
    const tile = createTile({
      agent_id: 'agent-d3',
      current_step: 'Execute long task name here',
      state: 'running',
      display_name: 'My Agent With Long Name',
    })
    const snapshot = createSnapshot('D3', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const d3Tile = screen.getByTestId('density-tile-d3')
    expect(d3Tile).toBeTruthy()
    // Should not render full card elements
    expect(screen.queryByText('dispatched')).toBeNull()
    expect(screen.queryByText('50% complete')).toBeNull()
    expect(screen.queryByText('2 review cycles')).toBeNull()
  })

  it('fires onSelectTile when D3 tile is clicked', () => {
    const handler = vi.fn()
    const tile = createTile({ agent_id: 'agent-d3-click' })
    const snapshot = createSnapshot('D3', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={handler} />,
    )

    fireEvent.click(screen.getByTestId('density-tile-d3'))
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({ agent_id: 'agent-d3-click' }),
      }),
    )
  })
})

describe('MaoDensityGrid D4 tiny square', () => {
  it('renders tiny square at D4 with no text', () => {
    const tile = createTile({
      agent_id: 'agent-d4',
      state: 'running',
      display_name: 'Visible Name',
    })
    const snapshot = createSnapshot('D4', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const d4Tile = screen.getByTestId('density-tile-d4') as HTMLElement
    expect(d4Tile).toBeTruthy()
    expect(d4Tile.style.width).toBe('1.5rem')
    expect(d4Tile.style.height).toBe('1.5rem')
    // No text content at D4
    expect(screen.queryByText('Visible Name')).toBeNull()
    expect(screen.queryByText('dispatched')).toBeNull()
  })

  it('fires onSelectTile when D4 tile is clicked', () => {
    const handler = vi.fn()
    const tile = createTile({ agent_id: 'agent-d4-click' })
    const snapshot = createSnapshot('D4', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={handler} />,
    )

    fireEvent.click(screen.getByTestId('density-tile-d4'))
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({ agent_id: 'agent-d4-click' }),
      }),
    )
  })
})

describe('MaoDensityGrid D4 clustering', () => {
  it('groups tiles by lifecycle state with state-group headers at D4', () => {
    const runningTile = createTile({ agent_id: 'a1', state: 'running' })
    const blockedTile = createTile({ agent_id: 'a2', state: 'blocked' })
    const completedTile = createTile({ agent_id: 'a3', state: 'completed' })
    const snapshot = createSnapshot('D4', [runningTile, blockedTile, completedTile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.getByTestId('cluster-running')).toBeTruthy()
    expect(screen.getByTestId('cluster-blocked')).toBeTruthy()
    expect(screen.getByTestId('cluster-completed')).toBeTruthy()
    // Headers show state name and count
    expect(screen.getByText('running (1)')).toBeTruthy()
    expect(screen.getByText('blocked (1)')).toBeTruthy()
    expect(screen.getByText('completed (1)')).toBeTruthy()
  })

  it('renders empty state when grid is empty at D4', () => {
    const snapshot = createSnapshot('D4', [])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.getByText('No MAO agent projections are available for the selected project.')).toBeTruthy()
  })
})

describe('MaoDensityGrid motion pulse', () => {
  it('applies nous-state-pulse-subtle class on running agent tile', () => {
    const tile = createTile({ agent_id: 'running-agent', state: 'running' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]')
    expect(button?.className).toContain('nous-state-pulse-subtle')
  })

  it('applies nous-state-pulse-strong class on blocked agent tile', () => {
    const tile = createTile({ agent_id: 'blocked-agent', state: 'blocked' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]')
    expect(button?.className).toContain('nous-state-pulse-strong')
  })

  it('does not apply pulse class on completed agent tile', () => {
    const tile = createTile({ agent_id: 'completed-agent', state: 'completed' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]')
    expect(button?.className).not.toContain('nous-state-pulse-subtle')
    expect(button?.className).not.toContain('nous-state-pulse-strong')
  })

  it('does not apply pulse class on canceled agent tile', () => {
    const tile = createTile({ agent_id: 'canceled-agent', state: 'canceled' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]')
    expect(button?.className).not.toContain('nous-state-pulse-subtle')
    expect(button?.className).not.toContain('nous-state-pulse-strong')
  })
})

describe('MaoDensityGrid urgent indicators', () => {
  it('renders URGENT badge, critical border, and timer at D0-D2 for urgent agent', () => {
    const tile = createTile({
      agent_id: 'urgent-agent',
      urgency_level: 'urgent',
      last_update_at: new Date(Date.now() - 5 * 60000).toISOString(),
    })
    const snapshot = createSnapshot('D2', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    expect(screen.getByTestId('urgent-indicator')).toBeTruthy()
    expect(screen.getByText('URGENT')).toBeTruthy()
    expect(screen.getByTestId('urgent-timer')).toBeTruthy()
  })

  it('renders critical border and urgent icon at D3 for urgent agent', () => {
    const tile = createTile({
      agent_id: 'urgent-d3',
      urgency_level: 'urgent',
    })
    const snapshot = createSnapshot('D3', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const d3Tile = screen.getByTestId('density-tile-d3') as HTMLElement
    // Urgent D3 tiles get a 2px solid red border via individual properties
    expect(d3Tile.style.borderWidth).toBe('2px')
    expect(d3Tile.style.borderStyle).toBe('solid')
    expect(screen.getByTestId('urgent-icon')).toBeTruthy()
  })

  it('renders ring-red-500 at D4 for urgent agent', () => {
    const tile = createTile({
      agent_id: 'urgent-d4',
      urgency_level: 'urgent',
    })
    const snapshot = createSnapshot('D4', [tile])

    render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const d4Tile = screen.getByTestId('density-tile-d4') as HTMLElement
    expect(d4Tile.style.boxShadow).toContain('#ef4444')
  })

  it('pins urgent agents to top of grid at D0-D3', () => {
    const normalTile = createTile({ agent_id: 'normal-agent', state: 'running', urgency_level: 'normal' })
    const urgentTile = createTile({ agent_id: 'urgent-agent', state: 'running', urgency_level: 'urgent' })
    const snapshot = createSnapshot('D2', [normalTile, urgentTile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const buttons = container.querySelectorAll('button[type="button"]')
    // Urgent agent should be rendered first
    expect(buttons[0].getAttribute('aria-label')).toContain('Inspect')
    // Check that the first button has the urgent indicator
    const firstTileText = buttons[0].textContent
    expect(firstTileText).toContain('URGENT')
  })
})

describe('MaoDensityGrid state color handling', () => {
  it('renders appropriate tone classes for canceled state (not default)', () => {
    const tile = createTile({ agent_id: 'canceled-agent', state: 'canceled' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]') as HTMLElement
    // Canceled state uses idle tone from CSS custom properties
    expect(button?.style.borderColor).toBe('var(--nous-state-idle-tone-border)')
    expect(button?.style.backgroundColor).toBe('var(--nous-state-idle-tone-bg)')
  })

  it('renders appropriate tone styles for hard_stopped state (not default)', () => {
    const tile = createTile({ agent_id: 'stopped-agent', state: 'hard_stopped' })
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const button = container.querySelector('[aria-label="Inspect Execute task"]') as HTMLElement
    // hard_stopped uses blocked tone from CSS custom properties
    expect(button?.style.borderColor).toBe('var(--nous-state-blocked-tone-border)')
    expect(button?.style.backgroundColor).toBe('var(--nous-state-blocked-tone-bg)')
  })
})

/**
 * UT-SP13-DENSITY-* — SP 13 polish surface coverage on the density grid.
 *
 * Per SDS § Invariants SUPV-SP13-007 + SUPV-SP13-008 + SUPV-SP13-009; Goals
 * SC-8 / SC-9 / SC-10. Mirrors the SP 10 / SP 12 matchMedia mock pattern at
 * `recovery-hard-stop-actions.test.tsx § UT-SP10-HARDSTOP-REDUCED-MOTION`
 * for the reduced-motion fixture.
 */
describe('UT-SP13-DENSITY — SP 13 polish surface coverage', () => {
  it('UT-SP13-DENSITY-AFFORDANCE — design-token CSS rules are emitted in the grid scope', () => {
    const tile = createTile()
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    // Inline style block carrying SUPV-SP13-007 design-token affordances.
    const styleNode = container.querySelector(
      'style[data-style-id="mao-density-grid-affordance"]',
    )
    expect(styleNode).toBeTruthy()
    const css = styleNode?.textContent ?? ''
    expect(css).toContain('--nous-state-active-tone-bg')
    expect(css).toContain('--nous-border-focus')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    // D0-D2 button carries the data-mao-tile attribute (SUPV-SP13-007 hook).
    const button = container.querySelector('[data-mao-tile]') as HTMLElement | null
    expect(button).toBeTruthy()
  })

  it('UT-SP13-DENSITY-D3-CUE — static "tap" cue renders at D3 only', () => {
    const tile = createTile()
    const snapshot = createSnapshot('D3', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    const cue = container.querySelector('[data-mao-cue="tap-to-inspect"]')
    expect(cue).toBeTruthy()
    expect(cue?.textContent).toBe('tap')
  })

  it('UT-SP13-DENSITY-NO-CUE-AT-LOWER-DENSITIES — static cue does NOT render at D0/D1/D2', () => {
    for (const mode of ['D0', 'D1', 'D2'] as const) {
      const tile = createTile({ agent_id: `tile-${mode.toLowerCase()}` })
      const snapshot = createSnapshot(mode, [tile])

      const { container, unmount } = render(
        <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
      )

      const cue = container.querySelector('[data-mao-cue="tap-to-inspect"]')
      expect(cue).toBeNull()
      unmount()
    }
  })

  it('UT-SP13-DENSITY-REDUCED-MOTION — CSS rule wraps motion-suppression under prefers-reduced-motion: reduce', () => {
    // matchMedia mock per SP 10 precedent.
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }))
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    })

    const tile = createTile()
    const snapshot = createSnapshot('D2', [tile])

    const { container } = render(
      <MaoDensityGrid snapshot={snapshot} selectedAgentId={null} onSelectTile={noop} />,
    )

    // Verify the inline `<style>` block contains the SUPV-SP13-009 motion-
    // suppression rule. Visibility is unconditional on motion preference;
    // only `transition` / `transform` / `animation` are suppressed.
    const styleNode = container.querySelector(
      'style[data-style-id="mao-density-grid-affordance"]',
    )
    expect(styleNode).toBeTruthy()
    const css = styleNode?.textContent ?? ''
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/)
    expect(css).toMatch(/data-mao-urgent-indicator[\s\S]*animation: none/)
  })
})
