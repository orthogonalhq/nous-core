/**
 * Task schema contract tests.
 *
 * WR-111 — Lightweight Task System.
 */
import { describe, it, expect } from 'vitest';
import {
  ManualTriggerConfigSchema,
  HeartbeatTriggerConfigSchema,
  WebhookTriggerConfigSchema,
  TaskTriggerConfigSchema,
  TaskDefinitionSchema,
  TaskCreateInputSchema,
  TaskUpdateInputSchema,
  TaskExecutionRecordSchema,
} from '../../types/task.js';

const TASK_ID = '550e8400-e29b-41d4-a716-446655440500';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const NOW = '2026-04-02T00:00:00.000Z';

describe('ManualTriggerConfigSchema', () => {
  it('accepts manual trigger with type only', () => {
    const result = ManualTriggerConfigSchema.safeParse({ type: 'manual' });
    expect(result.success).toBe(true);
  });

  it('rejects missing type', () => {
    expect(ManualTriggerConfigSchema.safeParse({}).success).toBe(false);
  });
});

describe('HeartbeatTriggerConfigSchema', () => {
  it('accepts heartbeat trigger with cronExpression and default timezone', () => {
    const result = HeartbeatTriggerConfigSchema.safeParse({
      type: 'heartbeat',
      cronExpression: '*/15 * * * *',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('UTC');
    }
  });

  it('accepts explicit timezone', () => {
    const result = HeartbeatTriggerConfigSchema.safeParse({
      type: 'heartbeat',
      cronExpression: '0 9 * * 1',
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('America/New_York');
    }
  });

  it('rejects empty cronExpression', () => {
    expect(
      HeartbeatTriggerConfigSchema.safeParse({
        type: 'heartbeat',
        cronExpression: '',
      }).success,
    ).toBe(false);
  });
});

describe('WebhookTriggerConfigSchema', () => {
  it('accepts webhook trigger with pathSegment and secret >= 32 chars', () => {
    const result = WebhookTriggerConfigSchema.safeParse({
      type: 'webhook',
      pathSegment: 'my-webhook',
      secret: 'a'.repeat(32),
    });
    expect(result.success).toBe(true);
  });

  it('accepts secret with exactly 32 characters', () => {
    expect(
      WebhookTriggerConfigSchema.safeParse({
        type: 'webhook',
        pathSegment: 'hook',
        secret: 'x'.repeat(32),
      }).success,
    ).toBe(true);
  });

  it('rejects secret with 31 characters', () => {
    expect(
      WebhookTriggerConfigSchema.safeParse({
        type: 'webhook',
        pathSegment: 'hook',
        secret: 'x'.repeat(31),
      }).success,
    ).toBe(false);
  });

  it('rejects empty pathSegment', () => {
    expect(
      WebhookTriggerConfigSchema.safeParse({
        type: 'webhook',
        pathSegment: '',
        secret: 'a'.repeat(32),
      }).success,
    ).toBe(false);
  });
});

describe('TaskTriggerConfigSchema', () => {
  it('parses manual trigger branch', () => {
    const result = TaskTriggerConfigSchema.safeParse({ type: 'manual' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('manual');
    }
  });

  it('parses heartbeat trigger branch', () => {
    const result = TaskTriggerConfigSchema.safeParse({
      type: 'heartbeat',
      cronExpression: '0 * * * *',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('heartbeat');
    }
  });

  it('parses webhook trigger branch', () => {
    const result = TaskTriggerConfigSchema.safeParse({
      type: 'webhook',
      pathSegment: 'test',
      secret: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('webhook');
    }
  });

  it('rejects unknown trigger type', () => {
    expect(
      TaskTriggerConfigSchema.safeParse({ type: 'unknown' }).success,
    ).toBe(false);
  });
});

describe('TaskDefinitionSchema', () => {
  const validTask = {
    id: TASK_ID,
    name: 'Daily Report',
    description: 'Generate daily report',
    trigger: { type: 'manual' as const },
    orchestratorInstructions: 'Generate a summary report of project activity',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('parses valid task definition with all required fields', () => {
    const result = TaskDefinitionSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(TASK_ID);
      expect(result.data.name).toBe('Daily Report');
      expect(result.data.enabled).toBe(true);
    }
  });

  it('applies defaults for optional fields', () => {
    const result = TaskDefinitionSchema.safeParse({
      id: TASK_ID,
      name: 'Minimal Task',
      trigger: { type: 'manual' },
      orchestratorInstructions: 'Do something',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
      expect(result.data.enabled).toBe(false);
      expect(result.data.context).toBeUndefined();
    }
  });

  it('accepts task with context', () => {
    const result = TaskDefinitionSchema.safeParse({
      ...validTask,
      context: { key: 'value', nested: { a: 1 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toEqual({ key: 'value', nested: { a: 1 } });
    }
  });

  it('rejects missing required fields', () => {
    expect(TaskDefinitionSchema.safeParse({}).success).toBe(false);
    expect(
      TaskDefinitionSchema.safeParse({ ...validTask, id: undefined }).success,
    ).toBe(false);
    expect(
      TaskDefinitionSchema.safeParse({ ...validTask, trigger: undefined }).success,
    ).toBe(false);
  });

  it('rejects empty name', () => {
    expect(
      TaskDefinitionSchema.safeParse({ ...validTask, name: '' }).success,
    ).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    expect(
      TaskDefinitionSchema.safeParse({ ...validTask, name: 'x'.repeat(101) }).success,
    ).toBe(false);
  });

  it('rejects empty instructions', () => {
    expect(
      TaskDefinitionSchema.safeParse({
        ...validTask,
        orchestratorInstructions: '',
      }).success,
    ).toBe(false);
  });
});

describe('TaskCreateInputSchema', () => {
  it('parses valid create input with defaults', () => {
    const result = TaskCreateInputSchema.safeParse({
      name: 'New Task',
      trigger: { type: 'manual' },
      orchestratorInstructions: 'Execute this task',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
      expect(result.data.enabled).toBe(false);
    }
  });
});

describe('TaskUpdateInputSchema', () => {
  it('accepts partial updates', () => {
    expect(
      TaskUpdateInputSchema.safeParse({ name: 'Updated' }).success,
    ).toBe(true);
    expect(
      TaskUpdateInputSchema.safeParse({ enabled: true }).success,
    ).toBe(true);
    expect(
      TaskUpdateInputSchema.safeParse({}).success,
    ).toBe(true);
  });
});

describe('TaskExecutionRecordSchema', () => {
  const validRecord = {
    id: TASK_ID,
    taskDefinitionId: TASK_ID,
    projectId: PROJECT_ID,
    triggeredAt: NOW,
    triggerType: 'manual' as const,
    status: 'running' as const,
  };

  it('parses valid execution record with running status', () => {
    const result = TaskExecutionRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('parses completed execution record with optional fields', () => {
    const result = TaskExecutionRecordSchema.safeParse({
      ...validRecord,
      status: 'completed',
      completedAt: NOW,
      outcome: 'Success: report generated',
      orchestratorAgentId: 'agent-123',
      durationMs: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('completed');
      expect(result.data.durationMs).toBe(5000);
    }
  });

  it('parses failed execution record', () => {
    const result = TaskExecutionRecordSchema.safeParse({
      ...validRecord,
      status: 'failed',
      completedAt: NOW,
      outcome: 'Error: timeout',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
    }
  });

  it('accepts all trigger types', () => {
    for (const triggerType of ['manual', 'heartbeat', 'webhook'] as const) {
      expect(
        TaskExecutionRecordSchema.safeParse({
          ...validRecord,
          triggerType,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(
      TaskExecutionRecordSchema.safeParse({
        ...validRecord,
        status: 'invalid',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid trigger type', () => {
    expect(
      TaskExecutionRecordSchema.safeParse({
        ...validRecord,
        triggerType: 'invalid',
      }).success,
    ).toBe(false);
  });
});
