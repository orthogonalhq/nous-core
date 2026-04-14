import { describe, it, expect } from 'vitest';
import {
  WorkflowNodeStatusChangedPayloadSchema,
  WorkflowRunCompletedPayloadSchema,
} from '../types.js';

const NOW = new Date().toISOString();
const UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const UUID_3 = '550e8400-e29b-41d4-a716-446655440003';

const validNodeStatusPayload = {
  workflowRunId: UUID_1,
  nodeId: UUID_2,
  projectId: UUID_3,
  status: 'running' as const,
  emittedAt: NOW,
};

const validRunCompletedPayload = {
  workflowRunId: UUID_1,
  projectId: UUID_3,
  outcome: 'completed' as const,
  emittedAt: NOW,
};

describe('WorkflowNodeStatusChangedPayloadSchema', () => {
  it('parses a valid payload with all fields', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse(validNodeStatusPayload);
    expect(result.success).toBe(true);
  });

  it('accepts all valid status values', () => {
    const statuses = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
    for (const status of statuses) {
      const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
        ...validNodeStatusPayload,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects payload with invalid status enum value', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      ...validNodeStatusPayload,
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with missing required fields', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      workflowRunId: UUID_1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-UUID workflowRunId', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      ...validNodeStatusPayload,
      workflowRunId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-UUID nodeId', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      ...validNodeStatusPayload,
      nodeId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-UUID projectId', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      ...validNodeStatusPayload,
      projectId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-datetime emittedAt', () => {
    const result = WorkflowNodeStatusChangedPayloadSchema.safeParse({
      ...validNodeStatusPayload,
      emittedAt: 'not-a-datetime',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowRunCompletedPayloadSchema', () => {
  it('parses a valid payload with all fields', () => {
    const result = WorkflowRunCompletedPayloadSchema.safeParse(validRunCompletedPayload);
    expect(result.success).toBe(true);
  });

  it('accepts all valid outcome values', () => {
    const outcomes = ['completed', 'failed', 'cancelled'] as const;
    for (const outcome of outcomes) {
      const result = WorkflowRunCompletedPayloadSchema.safeParse({
        ...validRunCompletedPayload,
        outcome,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects payload with invalid outcome enum value', () => {
    const result = WorkflowRunCompletedPayloadSchema.safeParse({
      ...validRunCompletedPayload,
      outcome: 'canceled',
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-datetime emittedAt', () => {
    const result = WorkflowRunCompletedPayloadSchema.safeParse({
      ...validRunCompletedPayload,
      emittedAt: 12345,
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with missing required fields', () => {
    const result = WorkflowRunCompletedPayloadSchema.safeParse({
      workflowRunId: UUID_1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with non-UUID workflowRunId', () => {
    const result = WorkflowRunCompletedPayloadSchema.safeParse({
      ...validRunCompletedPayload,
      workflowRunId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
