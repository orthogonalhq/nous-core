// @vitest-environment jsdom

import * as React from 'react'
import { render, screen } from '@testing-library/react'
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
