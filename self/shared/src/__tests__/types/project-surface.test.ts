import { describe, expect, it } from 'vitest';
import {
  ProjectBlockedActionSchema,
  ProjectConfigurationSnapshotSchema,
  ProjectConfigurationUpdateInputSchema,
  ProjectDashboardSnapshotSchema,
  ProjectHealthSummarySchema,
} from '../../types/project-surface.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440310';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440311';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440312';
const NOW = '2026-03-09T00:00:00.000Z';

describe('ProjectBlockedActionSchema', () => {
  it('parses reason-coded blocked action records', () => {
    const result = ProjectBlockedActionSchema.safeParse({
      action: 'edit_project_configuration',
      allowed: false,
      reasonCode: 'control_state_hard_stopped',
      message: 'Project configuration is read-only while hard stopped.',
      evidenceRefs: ['project-control:hard_stopped'],
    });

    expect(result.success).toBe(true);
  });
});

describe('ProjectHealthSummarySchema', () => {
  it('parses project health summaries', () => {
    const result = ProjectHealthSummarySchema.safeParse({
      overallStatus: 'attention_required',
      runtimeAvailability: 'live',
      activeRunStatus: 'waiting',
      blockedNodeCount: 0,
      waitingNodeCount: 1,
      enabledScheduleCount: 2,
      overdueScheduleCount: 1,
      openEscalationCount: 1,
      urgentEscalationCount: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('ProjectDashboardSnapshotSchema', () => {
  it('parses dashboard snapshots that compose workflow, schedule, and escalation truth', () => {
    const result = ProjectDashboardSnapshotSchema.safeParse({
      project: {
        id: PROJECT_ID,
        name: 'Dashboard Test',
        type: 'hybrid',
      },
      health: {
        overallStatus: 'blocked',
        runtimeAvailability: 'live',
        activeRunStatus: 'blocked_review',
        blockedNodeCount: 1,
        waitingNodeCount: 0,
        enabledScheduleCount: 1,
        overdueScheduleCount: 0,
        openEscalationCount: 1,
        urgentEscalationCount: 1,
      },
      controlProjection: null,
      workflowSnapshot: {
        project: {
          id: PROJECT_ID,
          name: 'Dashboard Test',
          type: 'hybrid',
        },
        workflowDefinition: {
          id: WORKFLOW_ID,
          projectId: PROJECT_ID,
          mode: 'hybrid',
          version: '1.0.0',
          name: 'Workflow',
          entryNodeIds: [NODE_ID],
          nodes: [
            {
              id: NODE_ID,
              name: 'Draft',
              type: 'model-call',
              governance: 'must',
              executionModel: 'synchronous',
              config: {
                type: 'model-call',
                modelRole: 'reasoner',
                promptRef: 'prompt://draft',
              },
            },
          ],
          edges: [],
        },
        graph: null,
        runtimeAvailability: 'live',
        activeRunState: null,
        recentRuns: [],
        nodeProjections: [],
        recentArtifacts: [],
        recentTraces: [],
        controlProjection: null,
        diagnostics: {
          runtimePosture: 'single_process_local',
          inspectFirstMode: 'hybrid',
        },
      },
      schedules: [],
      openEscalations: [],
      blockedActions: [],
      packageDefaultIntake: [],
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('ProjectConfigurationSnapshotSchema', () => {
  it('parses config snapshots with field provenance', () => {
    const result = ProjectConfigurationSnapshotSchema.safeParse({
      projectId: PROJECT_ID,
      updatedAt: NOW,
      config: {
        id: PROJECT_ID,
        name: 'Config Test',
        type: 'hybrid',
        pfcTier: 3,
        memoryAccessPolicy: {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: true,
        },
        escalationChannels: ['in-app'],
        retrievalBudgetTokens: 500,
        createdAt: NOW,
        updatedAt: NOW,
      },
      schedules: [],
      blockedActions: [],
      fieldProvenance: [
        {
          field: 'type',
          source: 'project_override',
          evidenceRefs: ['project-config:type'],
          lockedByPolicy: false,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('ProjectConfigurationUpdateInputSchema', () => {
  it('requires at least one configuration field update', () => {
    expect(
      ProjectConfigurationUpdateInputSchema.safeParse({
        projectId: PROJECT_ID,
        updates: {
          pfcTier: 4,
        },
      }).success,
    ).toBe(true);

    expect(
      ProjectConfigurationUpdateInputSchema.safeParse({
        projectId: PROJECT_ID,
        updates: {},
      }).success,
    ).toBe(false);
  });
});
