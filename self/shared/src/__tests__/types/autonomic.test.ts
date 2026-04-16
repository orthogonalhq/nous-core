import { describe, expect, it } from 'vitest';
import {
  AgentStatusSnapshotSchema,
  SystemStatusSnapshotSchema,
} from '../../types/autonomic.js';
import { GatewayExecutionContextSchema } from '../../types/agent-gateway.js';

describe('GatewayExecutionContextSchema — escalationOrigin extension', () => {
  it('parses with escalationOrigin: true (strict round-trip)', () => {
    const input = {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      escalationOrigin: true,
    };
    const parsed = GatewayExecutionContextSchema.parse(input);
    expect(parsed.escalationOrigin).toBe(true);
  });

  it('parses with escalationOrigin: false', () => {
    const input = {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      escalationOrigin: false,
    };
    const parsed = GatewayExecutionContextSchema.parse(input);
    expect(parsed.escalationOrigin).toBe(false);
  });

  it('parses without escalationOrigin (backward compat)', () => {
    const input = {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
    };
    const parsed = GatewayExecutionContextSchema.parse(input);
    expect(parsed.escalationOrigin).toBeUndefined();
  });
});

describe('SystemStatusSnapshotSchema — checkpoint/escalation extension', () => {
  const BASE_SNAPSHOT = {
    bootStatus: 'ready' as const,
    completedBootSteps: ['subcortex_initialized'],
    issueCodes: [],
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 0,
      failedInWindow: 0,
      pressureTrend: 'stable' as const,
    },
    collectedAt: '2026-03-25T10:00:00.000Z',
  };

  it('parses with all new optional fields present', () => {
    const input = {
      ...BASE_SNAPSHOT,
      escalationCount: 3,
      lastEscalationAt: '2026-03-25T10:00:00.000Z',
      lastEscalationSeverity: 'critical',
      lastPreparedCheckpointId: 'cp-001',
      lastCommittedCheckpointId: 'cp-001',
      chainValid: true,
    };
    const parsed = SystemStatusSnapshotSchema.parse(input);
    expect(parsed.escalationCount).toBe(3);
    expect(parsed.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
    expect(parsed.lastEscalationSeverity).toBe('critical');
    expect(parsed.lastPreparedCheckpointId).toBe('cp-001');
    expect(parsed.lastCommittedCheckpointId).toBe('cp-001');
    expect(parsed.chainValid).toBe(true);
  });

  it('parses without any new fields (backward compat)', () => {
    const parsed = SystemStatusSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(parsed.escalationCount).toBeUndefined();
    expect(parsed.lastEscalationAt).toBeUndefined();
    expect(parsed.chainValid).toBeUndefined();
  });
});

describe('AgentStatusSnapshotSchema — escalation extension', () => {
  const BASE_SNAPSHOT = {
    gateways: [],
    appSessions: [],
    collectedAt: '2026-03-25T10:00:00.000Z',
  };

  it('parses with all new optional escalation fields', () => {
    const input = {
      ...BASE_SNAPSHOT,
      escalationCount: 1,
      lastEscalationAt: '2026-03-25T10:00:00.000Z',
      lastEscalationSeverity: 'high',
    };
    const parsed = AgentStatusSnapshotSchema.parse(input);
    expect(parsed.escalationCount).toBe(1);
    expect(parsed.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
    expect(parsed.lastEscalationSeverity).toBe('high');
  });

  it('parses without any new fields (backward compat)', () => {
    const parsed = AgentStatusSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(parsed.escalationCount).toBeUndefined();
    expect(parsed.lastEscalationAt).toBeUndefined();
    expect(parsed.lastEscalationSeverity).toBeUndefined();
  });
});
