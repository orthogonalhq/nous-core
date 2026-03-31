// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaoInspectPanel } from '../mao-inspect-panel'
import { MaoServicesProvider } from '../mao-services-context'
import type { MaoAgentInspectProjection } from '@nous/shared'

function FakeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <a href={href} className={className}>{children}</a>
}

const mockServices = {
  Link: FakeLink,
  useProject: () => ({ projectId: 'proj-001', setProjectId: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MaoServicesProvider value={mockServices}>{children}</MaoServicesProvider>
}

function createInspect(
  overrides?: Partial<MaoAgentInspectProjection>,
): MaoAgentInspectProjection {
  return {
    projectId: 'proj-001',
    workflowRunId: 'run-001',
    agent: {
      agent_id: 'agent-001',
      current_step: 'Process data',
      dispatch_state: 'dispatched',
      state: 'running',
      risk_level: 'low',
      attention_level: 'normal',
      progress_percent: 75,
      reflection_cycle_count: 1,
      reasoning_log_preview: null,
      urgency_level: 'normal',
      workflow_run_id: 'run-001',
      workflow_node_definition_id: 'node-001',
      deepLinks: [],
      evidenceRefs: [],
    },
    projectControlState: 'nominal',
    runStatus: 'running',
    waitKind: undefined,
    latestAttempt: null,
    correctionArcs: [],
    evidenceRefs: [],
    generatedAt: '2026-03-28T10:00:00Z',
    ...overrides,
  } as unknown as MaoAgentInspectProjection
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('MaoInspectPanel label, lineage, and badge', () => {
  it('uses display_name as primary label when present', () => {
    const inspect = createInspect({
      agent: {
        agent_id: 'agent-001',
        current_step: 'Process data',
        display_name: 'Custom Agent Name',
        dispatch_state: 'dispatched',
        state: 'running',
        risk_level: 'low',
        attention_level: 'normal',
        progress_percent: 75,
        reflection_cycle_count: 1,
        reasoning_log_preview: null,
        urgency_level: 'normal',
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
        deepLinks: [],
        evidenceRefs: [],
      } as any,
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    const label = screen.getByTestId('inspect-primary-label')
    expect(label.textContent).toBe('Custom Agent Name')
  })

  it('falls back to current_step when display_name is absent', () => {
    const inspect = createInspect()

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    const label = screen.getByTestId('inspect-primary-label')
    expect(label.textContent).toBe('Process data')
  })

  it('renders dispatch lineage with resolved agent label when dispatching_task_agent_id is present', () => {
    const resolverFn = vi.fn().mockReturnValue('Parent Orchestrator')
    const inspect = createInspect({
      agent: {
        agent_id: 'agent-001',
        current_step: 'Process data',
        dispatching_task_agent_id: 'parent-agent-uuid',
        dispatch_state: 'dispatched',
        state: 'running',
        risk_level: 'low',
        attention_level: 'normal',
        progress_percent: 75,
        reflection_cycle_count: 1,
        reasoning_log_preview: null,
        urgency_level: 'normal',
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
        deepLinks: [],
        evidenceRefs: [],
      } as any,
    })

    render(
      <MaoInspectPanel
        inspect={inspect}
        isLoading={false}
        resolveAgentLabel={resolverFn}
      />,
      { wrapper: Wrapper },
    )

    const lineage = screen.getByTestId('inspect-dispatch-lineage')
    expect(lineage).toBeTruthy()
    expect(lineage.textContent).toContain('Parent Orchestrator')
    expect(resolverFn).toHaveBeenCalledWith('parent-agent-uuid')
  })

  it('omits dispatch lineage when dispatching_task_agent_id is null', () => {
    const inspect = createInspect({
      agent: {
        agent_id: 'agent-001',
        current_step: 'Process data',
        dispatching_task_agent_id: null,
        dispatch_state: 'dispatched',
        state: 'running',
        risk_level: 'low',
        attention_level: 'normal',
        progress_percent: 75,
        reflection_cycle_count: 1,
        reasoning_log_preview: null,
        urgency_level: 'normal',
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
        deepLinks: [],
        evidenceRefs: [],
      } as any,
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    expect(screen.queryByTestId('inspect-dispatch-lineage')).toBeNull()
  })

  it('renders agent class badge when agent_class is present', () => {
    const inspect = createInspect({
      agent: {
        agent_id: 'agent-001',
        current_step: 'Process data',
        agent_class: 'Worker',
        dispatch_state: 'dispatched',
        state: 'running',
        risk_level: 'low',
        attention_level: 'normal',
        progress_percent: 75,
        reflection_cycle_count: 1,
        reasoning_log_preview: null,
        urgency_level: 'normal',
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
        deepLinks: [],
        evidenceRefs: [],
      } as any,
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    const badge = screen.getByTestId('inspect-agent-class-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('Worker')
  })

  it('renders formatShortId fallback when resolveAgentLabel is not provided', () => {
    const inspect = createInspect({
      agent: {
        agent_id: 'agent-001',
        current_step: 'Process data',
        dispatching_task_agent_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        dispatch_state: 'dispatched',
        state: 'running',
        risk_level: 'low',
        attention_level: 'normal',
        progress_percent: 75,
        reflection_cycle_count: 1,
        reasoning_log_preview: null,
        urgency_level: 'normal',
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
        deepLinks: [],
        evidenceRefs: [],
      } as any,
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    const lineage = screen.getByTestId('inspect-dispatch-lineage')
    expect(lineage).toBeTruthy()
    // Should show short UUID format (first 8 chars)
    expect(lineage.textContent).toContain('aaaaaaaa')
  })
})

describe('MaoInspectPanel inference history', () => {
  it('renders with inference history section collapsed by default', () => {
    const inspect = createInspect({
      inference_history: [
        {
          providerId: 'anthropic',
          modelId: 'claude-4',
          traceId: 'trace-001',
          inputTokens: 500,
          outputTokens: 1500,
          latencyMs: 142,
          timestamp: '2026-03-28T10:00:00Z',
        },
      ],
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    // Toggle button is visible
    expect(screen.getByTestId('inference-history-toggle')).toBeTruthy()
    expect(screen.getByText('Inference History')).toBeTruthy()
    // Table is not rendered because section is collapsed
    expect(screen.queryByTestId('inference-history-table')).toBeNull()
  })

  it('expands on toggle click to show inference history table', () => {
    const inspect = createInspect({
      inference_history: [
        {
          providerId: 'anthropic',
          modelId: 'claude-4',
          traceId: 'trace-001',
          inputTokens: 500,
          outputTokens: 1500,
          latencyMs: 142,
          timestamp: '2026-03-28T10:00:00Z',
        },
      ],
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    expect(screen.getByTestId('inference-history-table')).toBeTruthy()
    expect(screen.getByText('anthropic')).toBeTruthy()
    expect(screen.getByText('claude-4')).toBeTruthy()
    expect(screen.getByText('142ms')).toBeTruthy()
  })

  it('shows placeholder when inference_history is undefined', () => {
    const inspect = createInspect({ inference_history: undefined })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    expect(screen.getByText('No inference history available.')).toBeTruthy()
  })

  it('shows placeholder when inference_history is empty', () => {
    const inspect = createInspect({ inference_history: [] })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    expect(screen.getByText('No inference history available.')).toBeTruthy()
  })

  it('renders history rows with formatted token values and latency', () => {
    const inspect = createInspect({
      inference_history: [
        {
          providerId: 'openai',
          modelId: 'gpt-5',
          traceId: 'trace-002',
          inputTokens: 12450,
          outputTokens: 8300,
          latencyMs: 210.7,
          timestamp: '2026-03-28T09:00:00Z',
        },
      ],
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    expect(screen.getByText('12,450')).toBeTruthy()
    expect(screen.getByText('8,300')).toBeTruthy()
    expect(screen.getByText('211ms')).toBeTruthy() // Math.round(210.7) = 211
  })

  it('handles missing optional fields (inputTokens, outputTokens undefined)', () => {
    const inspect = createInspect({
      inference_history: [
        {
          providerId: 'anthropic',
          modelId: 'claude-4',
          traceId: 'trace-003',
          latencyMs: 100,
          timestamp: '2026-03-28T08:00:00Z',
        },
      ],
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    const table = screen.getByTestId('inference-history-table')
    // em-dash rendered for missing tokens
    const dashes = within(table).getAllByText('\u2014')
    expect(dashes.length).toBe(2) // inputTokens and outputTokens both undefined
  })

  it('sorts inference history most-recent-first', () => {
    const inspect = createInspect({
      inference_history: [
        {
          providerId: 'provider-a',
          modelId: 'model-old',
          traceId: 'trace-old',
          inputTokens: 100,
          outputTokens: 200,
          latencyMs: 50,
          timestamp: '2026-03-28T08:00:00Z',
        },
        {
          providerId: 'provider-b',
          modelId: 'model-new',
          traceId: 'trace-new',
          inputTokens: 300,
          outputTokens: 400,
          latencyMs: 75,
          timestamp: '2026-03-28T12:00:00Z',
        },
      ],
    })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))

    const table = screen.getByTestId('inference-history-table')
    const rows = table.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    // Most recent first: provider-b (12:00) should be before provider-a (08:00)
    expect(rows[0]!.textContent).toContain('provider-b')
    expect(rows[1]!.textContent).toContain('provider-a')
  })

  it('caps displayed entries at 50', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      providerId: `provider-${i}`,
      modelId: `model-${i}`,
      traceId: `trace-${i}`,
      inputTokens: i * 100,
      outputTokens: i * 50,
      latencyMs: i * 10,
      timestamp: new Date(Date.UTC(2026, 2, 28, 0, 0, i)).toISOString(),
    }))

    const inspect = createInspect({ inference_history: history })

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    })

    fireEvent.click(screen.getByTestId('inference-history-toggle'))
    const table = screen.getByTestId('inference-history-table')
    const rows = table.querySelectorAll('tbody tr')
    expect(rows.length).toBe(50)
  })
})
