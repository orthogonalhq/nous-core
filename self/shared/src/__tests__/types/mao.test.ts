/**
 * MAO projection schema tests.
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 */
import { describe, it, expect } from 'vitest';
import {
  MaoDensityModeSchema,
  ProjectControlStateSchema,
  MaoAgentLifecycleStateSchema,
  MaoReasoningLogPreviewSchema,
  MaoAgentProjectionSchema,
  MaoGridTileProjectionSchema,
  MaoRunGraphSnapshotSchema,
  MaoProjectSnapshotSchema,
  MaoAgentInspectProjectionSchema,
  MaoProjectControlImpactSummarySchema,
  MaoProjectControlRequestSchema,
  MaoProjectControlResultSchema,
  MaoProjectControlProjectionSchema,
  MaoProjectControlActionSchema,
  MaoEventTypeSchema,
  MaoSystemSnapshotInputSchema,
  MaoSystemSnapshotSchema,
} from '../../types/mao.js';
import { WorkflowNodeMetadataSchema } from '../../types/workflow.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as const;
const AGENT_ID = '22222222-2222-2222-2222-222222222222' as const;
const RUN_ID = '33333333-3333-3333-3333-333333333333' as const;
const NODE_ID = '44444444-4444-4444-4444-444444444444' as const;
const COMMAND_ID = '55555555-5555-5555-5555-555555555555' as const;

describe('MaoDensityModeSchema', () => {
  it('accepts valid density modes', () => {
    expect(MaoDensityModeSchema.parse('D0')).toBe('D0');
    expect(MaoDensityModeSchema.parse('D4')).toBe('D4');
  });

  it('rejects invalid density mode', () => {
    expect(() => MaoDensityModeSchema.parse('D5')).toThrow();
  });
});

describe('ProjectControlStateSchema', () => {
  it('accepts valid states', () => {
    expect(ProjectControlStateSchema.parse('running')).toBe('running');
    expect(ProjectControlStateSchema.parse('paused_review')).toBe('paused_review');
    expect(ProjectControlStateSchema.parse('hard_stopped')).toBe('hard_stopped');
    expect(ProjectControlStateSchema.parse('resuming')).toBe('resuming');
  });

  it('rejects invalid state', () => {
    expect(() => ProjectControlStateSchema.parse('invalid')).toThrow();
  });
});

describe('MaoAgentLifecycleStateSchema', () => {
  it('accepts waiting and resuming lifecycle states', () => {
    expect(MaoAgentLifecycleStateSchema.parse('waiting_pfc')).toBe('waiting_pfc');
    expect(MaoAgentLifecycleStateSchema.parse('resuming')).toBe('resuming');
  });
});

describe('MaoReasoningLogPreviewSchema', () => {
  it('accepts redaction-aware reasoning previews with deep links', () => {
    const parsed = MaoReasoningLogPreviewSchema.parse({
      class: 'blocker',
      summary: 'Waiting for principal review',
      evidenceRef: 'evidence://review',
      artifactRefs: ['artifact://summary'],
      redactionClass: 'public_operator',
      previewMode: 'inline',
      emittedAt: '2026-03-10T01:00:00.000Z',
      chatLink: {
        target: 'chat',
        projectId: PROJECT_ID,
        workflowRunId: RUN_ID,
        nodeDefinitionId: NODE_ID,
      },
      projectsLink: {
        target: 'projects',
        projectId: PROJECT_ID,
        workflowRunId: RUN_ID,
        nodeDefinitionId: NODE_ID,
      },
    });

    expect(parsed.projectsLink?.target).toBe('projects');
  });
});

describe('MaoAgentProjectionSchema', () => {
  const valid = {
    agent_id: AGENT_ID,
    project_id: PROJECT_ID,
    workflow_run_id: RUN_ID,
    workflow_node_definition_id: NODE_ID,
    dispatching_task_agent_id: null,
    dispatch_origin_ref: 'ref-1',
    state: 'running' as const,
    state_reason_code: 'workflow_running',
    current_step: 'step-1',
    progress_percent: 50,
    risk_level: 'low' as const,
    urgency_level: 'normal' as const,
    attention_level: 'none' as const,
    pfc_alert_status: 'none',
    pfc_mitigation_status: 'none',
    dispatch_state: 'dispatched',
    reflection_cycle_count: 0,
    last_update_at: '2026-02-24T22:00:00.000Z',
    reasoning_log_preview: {
      class: 'result_summary',
      summary: 'Step finished normally',
      evidenceRef: 'evidence://step',
      artifactRefs: [],
      redactionClass: 'public_operator' as const,
      previewMode: 'inline' as const,
      emittedAt: '2026-02-24T22:00:00.000Z',
    },
    reasoning_log_last_entry_class: 'result_summary' as const,
    reasoning_log_last_entry_at: '2026-02-24T22:00:00.000Z',
    reasoning_log_redaction_state: 'none' as const,
    deepLinks: [
      {
        target: 'chat' as const,
        projectId: PROJECT_ID,
        workflowRunId: RUN_ID,
        nodeDefinitionId: NODE_ID,
      },
    ],
    evidenceRefs: ['evidence://step'],
  };

  it('parses valid agent projection', () => {
    const result = MaoAgentProjectionSchema.parse(valid);
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.project_id).toBe(PROJECT_ID);
    expect(result.progress_percent).toBe(50);
    expect(result.reasoning_log_preview?.class).toBe('result_summary');
  });

  it('rejects invalid agent_id', () => {
    expect(() =>
      MaoAgentProjectionSchema.parse({ ...valid, agent_id: 'not-uuid' }),
    ).toThrow();
  });

  it('rejects progress_percent out of range', () => {
    expect(() =>
      MaoAgentProjectionSchema.parse({ ...valid, progress_percent: 101 }),
    ).toThrow();
  });
});

describe('MaoGridTileProjectionSchema', () => {
  it('accepts inspect-only density-grid tiles', () => {
    const parsed = MaoGridTileProjectionSchema.parse({
      agent: MaoAgentProjectionSchema.parse({
        agent_id: AGENT_ID,
        project_id: PROJECT_ID,
        dispatching_task_agent_id: null,
        dispatch_origin_ref: 'ref-1',
        state: 'waiting_pfc',
        current_step: 'Await approval',
        progress_percent: 25,
        risk_level: 'high',
        urgency_level: 'urgent',
        attention_level: 'urgent',
        pfc_alert_status: 'pending',
        pfc_mitigation_status: 'awaiting_operator',
        dispatch_state: 'blocked',
        reflection_cycle_count: 1,
        last_update_at: '2026-03-10T01:00:00.000Z',
        reasoning_log_preview: null,
        reasoning_log_redaction_state: 'partial',
      }),
      densityMode: 'D4',
      inspectOnly: true,
      showUrgentOverlay: true,
    });

    expect(parsed.inspectOnly).toBe(true);
  });
});

describe('MaoProjectControlProjectionSchema', () => {
  const valid = {
    project_id: PROJECT_ID,
    project_control_state: 'running' as const,
    active_agent_count: 2,
    blocked_agent_count: 0,
    urgent_agent_count: 0,
    resume_readiness_status: 'not_applicable' as const,
    pfc_project_review_status: 'none' as const,
    pfc_project_recommendation: 'continue' as const,
  };

  it('parses valid project control projection', () => {
    const result = MaoProjectControlProjectionSchema.parse({
      ...valid,
      voice_projection: {
        current_turn_state: 'listening',
        assistant_output_state: 'idle',
        degraded_mode: {
          session_id: '77777777-7777-7777-7777-777777777777',
          project_id: PROJECT_ID,
          active: false,
          evidence_refs: [],
        },
        pending_confirmation: {
          required: false,
          dual_channel_required: false,
          text_surface_targets: ['mobile'],
        },
        continuation_required: false,
        updated_at: '2026-03-10T01:00:00.000Z',
      },
    });
    expect(result.project_control_state).toBe('running');
    expect(result.active_agent_count).toBe(2);
    expect(result.voice_projection?.current_turn_state).toBe('listening');
  });

  it('rejects invalid project_control_state', () => {
    expect(() =>
      MaoProjectControlProjectionSchema.parse({
        ...valid,
        project_control_state: 'invalid',
      }),
    ).toThrow();
  });
});

describe('MaoProjectSnapshotSchema', () => {
  it('accepts grid and graph snapshots that reconcile to one project', () => {
    const parsed = MaoProjectSnapshotSchema.parse({
      projectId: PROJECT_ID,
      densityMode: 'D2',
      workflowRunId: RUN_ID,
      controlProjection: {
        project_id: PROJECT_ID,
        project_control_state: 'running',
        active_agent_count: 1,
        blocked_agent_count: 0,
        urgent_agent_count: 0,
        pfc_project_review_status: 'none',
        pfc_project_recommendation: 'continue',
      },
      grid: [],
      graph: {
        projectId: PROJECT_ID,
        workflowRunId: RUN_ID,
        nodes: [
          {
            id: `agent:${NODE_ID}`,
            kind: 'agent',
            agentId: AGENT_ID,
            workflowRunId: RUN_ID,
            workflowNodeDefinitionId: NODE_ID,
            label: 'Draft',
            state: 'running',
            evidenceRefs: ['evidence://draft'],
          },
        ],
        edges: [
          {
            id: 'edge-1',
            kind: 'dispatch',
            fromNodeId: `agent:${NODE_ID}`,
            toNodeId: `agent:${NODE_ID}`,
            reasonCode: 'workflow_started',
            evidenceRefs: ['evidence://dispatch'],
            occurredAt: '2026-03-10T01:00:00.000Z',
          },
        ],
        generatedAt: '2026-03-10T01:00:00.000Z',
      },
      urgentOverlay: {
        urgentAgentIds: [AGENT_ID],
        blockedAgentIds: [],
        generatedAt: '2026-03-10T01:00:00.000Z',
      },
      summary: {
        activeAgentCount: 1,
        blockedAgentCount: 0,
        failedAgentCount: 0,
        waitingPfcAgentCount: 0,
        urgentAgentCount: 1,
      },
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
      generatedAt: '2026-03-10T01:00:00.000Z',
    });

    expect(parsed.graph.nodes).toHaveLength(1);
    expect(parsed.summary.urgentAgentCount).toBe(1);
  });
});

describe('MaoRunGraphSnapshotSchema', () => {
  it('accepts corrective graph edges with evidence refs', () => {
    const parsed = MaoRunGraphSnapshotSchema.parse({
      projectId: PROJECT_ID,
      workflowRunId: RUN_ID,
      nodes: [],
      edges: [
        {
          id: 'edge-2',
          kind: 'reflection_review',
          fromNodeId: 'agent:a',
          toNodeId: 'agent:a',
          reasonCode: 'workflow_wait_paused_review',
          evidenceRefs: ['evidence://paused'],
          occurredAt: '2026-03-10T01:00:00.000Z',
        },
      ],
      generatedAt: '2026-03-10T01:00:00.000Z',
    });

    expect(parsed.edges[0]?.kind).toBe('reflection_review');
  });
});

describe('MaoAgentInspectProjectionSchema', () => {
  it('accepts inspect projections with attempt and correction summaries', () => {
    const parsed = MaoAgentInspectProjectionSchema.parse({
      projectId: PROJECT_ID,
      workflowRunId: RUN_ID,
      workflowNodeDefinitionId: NODE_ID,
      agent: {
        agent_id: AGENT_ID,
        project_id: PROJECT_ID,
        dispatching_task_agent_id: null,
        dispatch_origin_ref: 'ref-2',
        state: 'blocked',
        current_step: 'Review gate',
        progress_percent: 75,
        risk_level: 'high',
        urgency_level: 'urgent',
        attention_level: 'urgent',
        pfc_alert_status: 'active',
        pfc_mitigation_status: 'awaiting_operator',
        dispatch_state: 'blocked',
        reflection_cycle_count: 1,
        last_update_at: '2026-03-10T01:00:00.000Z',
        reasoning_log_preview: null,
        reasoning_log_redaction_state: 'restricted',
      },
      projectControlState: 'paused_review',
      runStatus: 'blocked_review',
      waitKind: 'human_decision',
      latestAttempt: {
        attempt: 1,
        status: 'blocked',
        reasonCode: 'workflow_wait_paused_review',
        evidenceRefs: ['evidence://paused'],
        startedAt: '2026-03-10T01:00:00.000Z',
      },
      correctionArcs: [
        {
          id: '66666666-6666-6666-6666-666666666666',
          type: 'resume',
          sourceAttempt: 1,
          reasonCode: 'workflow_resume_denied_hard_stopped',
          evidenceRefs: ['evidence://resume'],
          occurredAt: '2026-03-10T01:00:00.000Z',
        },
      ],
      evidenceRefs: ['evidence://paused'],
      generatedAt: '2026-03-10T01:00:00.000Z',
    });

    expect(parsed.waitKind).toBe('human_decision');
  });
});

describe('MaoProjectControl request/result schemas', () => {
  it('accepts impact-aware project control requests and results', () => {
    const impact = MaoProjectControlImpactSummarySchema.parse({
      activeRunCount: 1,
      activeAgentCount: 2,
      blockedAgentCount: 1,
      urgentAgentCount: 1,
      affectedScheduleCount: 1,
      evidenceRefs: ['evidence://impact'],
    });
    const request = MaoProjectControlRequestSchema.parse({
      command_id: COMMAND_ID,
      project_id: PROJECT_ID,
      action: 'resume_project',
      actor_id: 'principal-operator',
      actor_type: 'operator',
      reason: 'Resume after review',
      requested_at: '2026-03-10T01:00:00.000Z',
      impactSummary: impact,
    });
    const result = MaoProjectControlResultSchema.parse({
      command_id: COMMAND_ID,
      project_id: PROJECT_ID,
      accepted: true,
      status: 'applied',
      from_state: 'paused_review',
      to_state: 'resuming',
      reason_code: 'resume_requested',
      decision_ref: 'witness://decision',
      impactSummary: impact,
      evidenceRefs: ['evidence://resume'],
      readiness_status: 'pending',
    });

    expect(request.action).toBe('resume_project');
    expect(result.to_state).toBe('resuming');
  });
});

describe('MaoProjectControlActionSchema', () => {
  it('accepts valid actions', () => {
    expect(MaoProjectControlActionSchema.parse('pause_project')).toBe(
      'pause_project',
    );
    expect(MaoProjectControlActionSchema.parse('hard_stop_project')).toBe(
      'hard_stop_project',
    );
  });
});

describe('MaoEventTypeSchema', () => {
  it('accepts valid event types', () => {
    expect(MaoEventTypeSchema.parse('mao_agent_state_projected')).toBe(
      'mao_agent_state_projected',
    );
    expect(MaoEventTypeSchema.parse('mao_project_control_applied')).toBe(
      'mao_project_control_applied',
    );
  });
});

describe('MaoAgentProjectionSchema — agent_class and display_name', () => {
  const base = {
    agent_id: AGENT_ID,
    project_id: PROJECT_ID,
    dispatching_task_agent_id: null,
    dispatch_origin_ref: 'ref-1',
    state: 'running' as const,
    current_step: 'step-1',
    progress_percent: 50,
    risk_level: 'low' as const,
    urgency_level: 'normal' as const,
    attention_level: 'none' as const,
    pfc_alert_status: 'none',
    pfc_mitigation_status: 'none',
    dispatch_state: 'dispatched',
    reflection_cycle_count: 0,
    last_update_at: '2026-02-24T22:00:00.000Z',
    reasoning_log_preview: null,
    reasoning_log_redaction_state: 'none' as const,
  };

  it('accepts agent_class when provided', () => {
    const result = MaoAgentProjectionSchema.parse({
      ...base,
      agent_class: 'Worker',
    });
    expect(result.agent_class).toBe('Worker');
  });

  it('accepts display_name when provided', () => {
    const result = MaoAgentProjectionSchema.parse({
      ...base,
      display_name: 'Draft Agent',
    });
    expect(result.display_name).toBe('Draft Agent');
  });

  it('allows agent_class and display_name to be omitted', () => {
    const result = MaoAgentProjectionSchema.parse(base);
    expect(result.agent_class).toBeUndefined();
    expect(result.display_name).toBeUndefined();
  });

  it('rejects invalid agent_class value', () => {
    expect(() =>
      MaoAgentProjectionSchema.parse({ ...base, agent_class: 'InvalidClass' }),
    ).toThrow();
  });
});

describe('MaoSystemSnapshotInputSchema', () => {
  it('applies default densityMode of D2', () => {
    const result = MaoSystemSnapshotInputSchema.parse({});
    expect(result.densityMode).toBe('D2');
  });

  it('accepts explicit densityMode', () => {
    const result = MaoSystemSnapshotInputSchema.parse({ densityMode: 'D4' });
    expect(result.densityMode).toBe('D4');
  });
});

describe('MaoSystemSnapshotSchema', () => {
  it('accepts a valid system snapshot with agents and project controls', () => {
    const result = MaoSystemSnapshotSchema.parse({
      agents: [],
      leaseRoots: [],
      projectControls: {},
      densityMode: 'D2',
      generatedAt: '2026-03-10T01:00:00.000Z',
    });
    expect(result.agents).toEqual([]);
    expect(result.densityMode).toBe('D2');
  });

  it('defaults agents and leaseRoots to empty arrays', () => {
    const result = MaoSystemSnapshotSchema.parse({
      densityMode: 'D3',
      generatedAt: '2026-03-10T01:00:00.000Z',
    });
    expect(result.agents).toEqual([]);
    expect(result.leaseRoots).toEqual([]);
    expect(result.projectControls).toEqual({});
  });

  it('accepts populated agents and lease roots', () => {
    const result = MaoSystemSnapshotSchema.parse({
      agents: [
        {
          agent_id: AGENT_ID,
          project_id: PROJECT_ID,
          dispatching_task_agent_id: null,
          dispatch_origin_ref: 'ref-1',
          state: 'running',
          current_step: 'step-1',
          progress_percent: 50,
          risk_level: 'low',
          urgency_level: 'normal',
          attention_level: 'none',
          pfc_alert_status: 'none',
          pfc_mitigation_status: 'none',
          dispatch_state: 'dispatched',
          reflection_cycle_count: 0,
          last_update_at: '2026-02-24T22:00:00.000Z',
          reasoning_log_preview: null,
          reasoning_log_redaction_state: 'none',
        },
      ],
      leaseRoots: [AGENT_ID],
      projectControls: {
        [PROJECT_ID]: {
          project_id: PROJECT_ID,
          project_control_state: 'running',
          active_agent_count: 1,
          blocked_agent_count: 0,
          urgent_agent_count: 0,
          pfc_project_review_status: 'none',
          pfc_project_recommendation: 'continue',
        },
      },
      densityMode: 'D2',
      generatedAt: '2026-03-10T01:00:00.000Z',
    });
    expect(result.agents).toHaveLength(1);
    expect(result.leaseRoots).toEqual([AGENT_ID]);
  });
});

describe('WorkflowNodeMetadataSchema — displayName', () => {
  it('accepts displayName when provided', () => {
    const result = WorkflowNodeMetadataSchema.parse({
      specNodeId: 'node-1',
      displayName: 'My Custom Node',
    });
    expect(result.displayName).toBe('My Custom Node');
  });

  it('allows displayName to be omitted', () => {
    const result = WorkflowNodeMetadataSchema.parse({
      specNodeId: 'node-1',
    });
    expect(result.displayName).toBeUndefined();
  });

  it('rejects empty displayName', () => {
    expect(() =>
      WorkflowNodeMetadataSchema.parse({
        specNodeId: 'node-1',
        displayName: '',
      }),
    ).toThrow();
  });
});
