import { describe, expect, it } from 'vitest';
import {
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
});
