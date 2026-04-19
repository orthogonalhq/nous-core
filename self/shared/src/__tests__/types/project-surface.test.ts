import { describe, expect, it } from 'vitest';
import {
  MobileOperationsSnapshotSchema,
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

  it('accepts the archive_project action literal (sub-phase 1.1)', () => {
    const result = ProjectBlockedActionSchema.safeParse({
      action: 'archive_project',
      allowed: true,
      message: 'Archive is allowed while the project is running.',
      evidenceRefs: ['project-control:running'],
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
                modelRole: 'cortex-chat',
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

  // --- Sub-phase 1.1 new updates fields (decision §2) ---
  it('accepts new updates fields: name, description, budgetPolicy, icon, iconColor', () => {
    const result = ProjectConfigurationUpdateInputSchema.safeParse({
      projectId: PROJECT_ID,
      updates: {
        name: 'Renamed Project',
        description: 'freshly rewritten',
        budgetPolicy: {
          enabled: true,
          period: 'monthly',
          softThresholdPercent: 80,
          hardCeilingUsd: 100,
        },
        icon: 'lucide:Rocket',
        iconColor: '#00ff00',
      },
    });
    expect(result.success).toBe(true);
  });

  // --- Sub-phase 1.1 resetFields sibling (decision §3) ---
  it('accepts non-empty resetFields alongside non-empty updates', () => {
    const result = ProjectConfigurationUpdateInputSchema.safeParse({
      projectId: PROJECT_ID,
      updates: { name: 'NewName' },
      resetFields: ['description'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty updates with non-empty resetFields (pure-reset envelope)', () => {
    const result = ProjectConfigurationUpdateInputSchema.safeParse({
      projectId: PROJECT_ID,
      updates: {},
      resetFields: ['description'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an envelope with a field present in both updates and resetFields', () => {
    const result = ProjectConfigurationUpdateInputSchema.safeParse({
      projectId: PROJECT_ID,
      updates: { name: 'AmbiguousName' },
      resetFields: ['name'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty updates + empty resetFields', () => {
    expect(
      ProjectConfigurationUpdateInputSchema.safeParse({
        projectId: PROJECT_ID,
        updates: {},
        resetFields: [],
      }).success,
    ).toBe(false);
    expect(
      ProjectConfigurationUpdateInputSchema.safeParse({
        projectId: PROJECT_ID,
        updates: {},
      }).success,
    ).toBe(false);
  });
});

describe('ProjectHealthSummarySchema — task fields', () => {
  it('applies defaults for task health fields', () => {
    const result = ProjectHealthSummarySchema.safeParse({
      overallStatus: 'healthy',
      runtimeAvailability: 'live',
      blockedNodeCount: 0,
      waitingNodeCount: 0,
      enabledScheduleCount: 0,
      overdueScheduleCount: 0,
      openEscalationCount: 0,
      urgentEscalationCount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabledTaskCount).toBe(0);
      expect(result.data.recentTaskFailureCount).toBe(0);
    }
  });

  it('accepts populated task health fields', () => {
    const result = ProjectHealthSummarySchema.safeParse({
      overallStatus: 'attention_required',
      runtimeAvailability: 'live',
      blockedNodeCount: 0,
      waitingNodeCount: 0,
      enabledScheduleCount: 0,
      overdueScheduleCount: 0,
      openEscalationCount: 0,
      urgentEscalationCount: 0,
      enabledTaskCount: 3,
      recentTaskFailureCount: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabledTaskCount).toBe(3);
      expect(result.data.recentTaskFailureCount).toBe(1);
    }
  });
});

describe('ProjectDashboardSnapshotSchema — taskSummary field', () => {
  it('applies default taskSummary when not provided', () => {
    const result = ProjectDashboardSnapshotSchema.safeParse({
      project: {
        id: PROJECT_ID,
        name: 'Test',
        type: 'hybrid',
      },
      health: {
        overallStatus: 'healthy',
        runtimeAvailability: 'live',
        blockedNodeCount: 0,
        waitingNodeCount: 0,
        enabledScheduleCount: 0,
        overdueScheduleCount: 0,
        openEscalationCount: 0,
        urgentEscalationCount: 0,
      },
      controlProjection: null,
      workflowSnapshot: null,
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskSummary).toEqual({
        totalCount: 0,
        enabledCount: 0,
        recentExecutions: [],
      });
    }
  });

  it('accepts populated taskSummary', () => {
    const result = ProjectDashboardSnapshotSchema.safeParse({
      project: {
        id: PROJECT_ID,
        name: 'Test',
        type: 'hybrid',
      },
      health: {
        overallStatus: 'healthy',
        runtimeAvailability: 'live',
        blockedNodeCount: 0,
        waitingNodeCount: 0,
        enabledScheduleCount: 0,
        overdueScheduleCount: 0,
        openEscalationCount: 0,
        urgentEscalationCount: 0,
      },
      controlProjection: null,
      workflowSnapshot: null,
      taskSummary: {
        totalCount: 2,
        enabledCount: 1,
        recentExecutions: [
          {
            taskId: '550e8400-e29b-41d4-a716-446655440500',
            taskName: 'Daily Report',
            status: 'completed',
            triggeredAt: NOW,
          },
        ],
      },
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskSummary.totalCount).toBe(2);
      expect(result.data.taskSummary.recentExecutions).toHaveLength(1);
    }
  });

  it('z.array(ScheduleDefinitionSchema) parses correctly after base/refined split', async () => {
    // Verify that ScheduleDefinitionSchema (now ZodEffects) works inside z.array()
    // This validates the pattern used in ProjectDashboardSnapshotSchema and
    // ProjectConfigurationSnapshotSchema
    const { ScheduleDefinitionSchema } = await import('../../types/scheduler.js');
    const { z } = await import('zod');
    const arraySchema = z.array(ScheduleDefinitionSchema);
    const result = arraySchema.safeParse([
      {
        id: '550e8400-e29b-41d4-a716-446655440112',
        projectId: PROJECT_ID,
        workflowDefinitionId: WORKFLOW_ID,
        workmodeId: 'system:implementation',
        enabled: true,
        createdAt: NOW,
        updatedAt: NOW,
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
      },
    ]);
    expect(result.success).toBe(true);
  });
});

describe('MobileOperationsSnapshotSchema', () => {
  it('parses mobile operating snapshots that compose canonical dashboard, queue, voice, and trust truth', () => {
    const result = MobileOperationsSnapshotSchema.safeParse({
      project: {
        id: PROJECT_ID,
        name: 'Dashboard Test',
        type: 'hybrid',
      },
      dashboard: {
        project: {
          id: PROJECT_ID,
          name: 'Dashboard Test',
          type: 'hybrid',
        },
        health: {
          overallStatus: 'attention_required',
          runtimeAvailability: 'live',
          activeRunStatus: 'waiting',
          blockedNodeCount: 0,
          waitingNodeCount: 1,
          enabledScheduleCount: 2,
          overdueScheduleCount: 0,
          openEscalationCount: 1,
          urgentEscalationCount: 1,
        },
        controlProjection: null,
        workflowSnapshot: null,
        schedules: [],
        openEscalations: [],
        blockedActions: [],
        packageDefaultIntake: [],
        diagnostics: {
          runtimePosture: 'single_process_local',
        },
      },
      escalationQueue: {
        projectId: PROJECT_ID,
        items: [],
        openCount: 1,
        acknowledgedCount: 0,
        urgentCount: 1,
      },
      voiceSession: {
        session_id: '550e8400-e29b-41d4-a716-446655440399',
        project_id: PROJECT_ID,
        principal_id: 'principal',
        current_turn_state: 'awaiting_text_confirmation',
        assistant_output_state: 'idle',
        degraded_mode: {
          session_id: '550e8400-e29b-41d4-a716-446655440399',
          project_id: PROJECT_ID,
          active: false,
          evidence_refs: [],
        },
        pending_confirmation: {
          required: true,
          dual_channel_required: false,
          text_surface_targets: ['mobile'],
        },
        continuation_required: false,
        evidence_refs: [],
        updated_at: NOW,
      },
      endpointTrust: {
        projectId: PROJECT_ID,
        peripheralCount: 1,
        trustedPeripheralCount: 1,
        suspendedPeripheralCount: 0,
        revokedPeripheralCount: 0,
        sensoryEndpointCount: 1,
        actionEndpointCount: 0,
        activeSessionCount: 1,
        expiringSessionCount: 0,
        registryBlockedEndpointCount: 0,
        diagnostics: {},
      },
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});
