import { describe, expect, it } from 'vitest';
import {
  ScheduleDefinitionBaseSchema,
  ScheduleDefinitionSchema,
  ScheduleTriggerSpecSchema,
  ScheduleUpsertInputSchema,
} from '../../types/scheduler.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440110';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440111';
const SCHEDULE_ID = '550e8400-e29b-41d4-a716-446655440112';
const NOW = '2026-03-08T00:00:00.000Z';

describe('ScheduleTriggerSpecSchema', () => {
  it('accepts cron and calendar trigger variants', () => {
    expect(
      ScheduleTriggerSpecSchema.safeParse({
        kind: 'cron',
        cron: '0 * * * *',
        timezone: 'UTC',
      }).success,
    ).toBe(true);

    expect(
      ScheduleTriggerSpecSchema.safeParse({
        kind: 'calendar',
        execute_at: NOW,
      }).success,
    ).toBe(true);
  });

  it('accepts hook and system_event trigger variants', () => {
    expect(
      ScheduleTriggerSpecSchema.safeParse({
        kind: 'hook',
        event_name: 'project.updated',
        source_filter: 'source://project',
      }).success,
    ).toBe(true);

    expect(
      ScheduleTriggerSpecSchema.safeParse({
        kind: 'system_event',
        event_name: 'runtime.resume',
      }).success,
    ).toBe(true);
  });
});

describe('ScheduleDefinitionSchema', () => {
  const base = {
    id: SCHEDULE_ID,
    projectId: PROJECT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    workmodeId: 'system:implementation',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('parses a full schedule definition with due state', () => {
    const result = ScheduleDefinitionSchema.safeParse({
      ...base,
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
      requestedDeliveryMode: 'announce',
      payloadTemplateRef: 'payload://daily',
      nextDueAt: NOW,
      lastDispatchedAt: NOW,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedDeliveryMode).toBe('announce');
      expect(result.data.workflowDefinitionId).toBe(WORKFLOW_ID);
      expect(result.data.workmodeId).toBe('system:implementation');
    }
  });

  it('rejects a schedule without workflowDefinitionId or workmodeId', () => {
    expect(
      ScheduleDefinitionSchema.safeParse({
        ...base,
        workflowDefinitionId: undefined,
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
      }).success,
    ).toBe(false);

    expect(
      ScheduleDefinitionSchema.safeParse({
        ...base,
        workmodeId: undefined,
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
      }).success,
    ).toBe(false);
  });
});

const TASK_ID = '550e8400-e29b-41d4-a716-446655440113';

describe('ScheduleDefinitionSchema — exactly-one refinement', () => {
  const scheduleBase = {
    id: SCHEDULE_ID,
    projectId: PROJECT_ID,
    workmodeId: 'system:implementation',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    trigger: {
      kind: 'cron' as const,
      cron: '0 * * * *',
    },
  };

  it('accepts workflowDefinitionId only', () => {
    const result = ScheduleDefinitionSchema.safeParse({
      ...scheduleBase,
      workflowDefinitionId: WORKFLOW_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts taskDefinitionId only', () => {
    const result = ScheduleDefinitionSchema.safeParse({
      ...scheduleBase,
      taskDefinitionId: TASK_ID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects both workflowDefinitionId and taskDefinitionId', () => {
    const result = ScheduleDefinitionSchema.safeParse({
      ...scheduleBase,
      workflowDefinitionId: WORKFLOW_ID,
      taskDefinitionId: TASK_ID,
    });
    expect(result.success).toBe(false);
  });

  it('rejects neither workflowDefinitionId nor taskDefinitionId', () => {
    const result = ScheduleDefinitionSchema.safeParse(scheduleBase);
    expect(result.success).toBe(false);
  });
});

describe('ScheduleDefinitionBaseSchema', () => {
  it('supports .omit() for composition (unlike ZodEffects)', () => {
    const OmittedSchema = ScheduleDefinitionBaseSchema.omit({ projectId: true });
    const result = OmittedSchema.safeParse({
      id: SCHEDULE_ID,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ScheduleUpsertInputSchema', () => {
  it('accepts new or existing schedule upserts', () => {
    expect(
      ScheduleUpsertInputSchema.safeParse({
        projectId: PROJECT_ID,
        workflowDefinitionId: WORKFLOW_ID,
        workmodeId: 'system:implementation',
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
      }).success,
    ).toBe(true);

    expect(
      ScheduleUpsertInputSchema.safeParse({
        id: SCHEDULE_ID,
        projectId: PROJECT_ID,
        trigger: {
          kind: 'system_event',
          event_name: 'runtime.resume',
        },
      }).success,
    ).toBe(true);
  });

  it('accepts taskDefinitionId (no refinement — intentionally looser)', () => {
    expect(
      ScheduleUpsertInputSchema.safeParse({
        projectId: PROJECT_ID,
        taskDefinitionId: TASK_ID,
        trigger: {
          kind: 'cron',
          cron: '*/5 * * * *',
        },
      }).success,
    ).toBe(true);
  });

  it('accepts both workflowDefinitionId and taskDefinitionId (no refinement)', () => {
    expect(
      ScheduleUpsertInputSchema.safeParse({
        projectId: PROJECT_ID,
        workflowDefinitionId: WORKFLOW_ID,
        taskDefinitionId: TASK_ID,
        trigger: {
          kind: 'cron',
          cron: '*/5 * * * *',
        },
      }).success,
    ).toBe(true);
  });

  it('accepts neither workflowDefinitionId nor taskDefinitionId (no refinement)', () => {
    expect(
      ScheduleUpsertInputSchema.safeParse({
        projectId: PROJECT_ID,
        trigger: {
          kind: 'cron',
          cron: '*/5 * * * *',
        },
      }).success,
    ).toBe(true);
  });
});
