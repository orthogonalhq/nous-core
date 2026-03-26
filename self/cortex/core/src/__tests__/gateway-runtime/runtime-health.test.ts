import { describe, expect, it } from 'vitest';
import { GatewayRuntimeHealthSink } from '../../gateway-runtime/runtime-health.js';
import { GatewayHealthSnapshotSchema, SystemContextReplicaSchema } from '../../gateway-runtime/types.js';

describe('GatewayRuntimeHealthSink', () => {
  describe('escalation audit trail tracking', () => {
    it('recordEscalation increments count and updates last fields', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('critical', '2026-03-25T10:00:00.000Z');

      const summary = sink.getEscalationAuditSummary();
      expect(summary.escalationCount).toBe(1);
      expect(summary.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
      expect(summary.lastEscalationSeverity).toBe('critical');
    });

    it('recordEscalation increments count across multiple calls', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('low', '2026-03-25T10:00:00.000Z');
      sink.recordEscalation('critical', '2026-03-25T11:00:00.000Z');
      sink.recordEscalation('medium', '2026-03-25T12:00:00.000Z');

      const summary = sink.getEscalationAuditSummary();
      expect(summary.escalationCount).toBe(3);
      expect(summary.lastEscalationAt).toBe('2026-03-25T12:00:00.000Z');
      expect(summary.lastEscalationSeverity).toBe('medium');
    });

    it('recordEscalation with empty severity string stores it', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('', '2026-03-25T10:00:00.000Z');

      const summary = sink.getEscalationAuditSummary();
      expect(summary.lastEscalationSeverity).toBe('');
    });

    it('getEscalationAuditSummary returns zero count when no escalations recorded', () => {
      const sink = new GatewayRuntimeHealthSink();
      const summary = sink.getEscalationAuditSummary();
      expect(summary.escalationCount).toBe(0);
      expect(summary.lastEscalationAt).toBeUndefined();
      expect(summary.lastEscalationSeverity).toBeUndefined();
    });

    it('getGatewayHealth includes escalation fields after recording', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('high', '2026-03-25T10:00:00.000Z');

      const health = sink.getGatewayHealth('Cortex::System');
      expect(health.escalationCount).toBe(1);
      expect(health.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
      expect(health.lastEscalationSeverity).toBe('high');
    });

    it('getSystemContextReplica includes escalation fields after recording', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('critical', '2026-03-25T10:00:00.000Z');

      const replica = sink.getSystemContextReplica();
      expect(replica.escalationCount).toBe(1);
      expect(replica.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
      expect(replica.lastEscalationSeverity).toBe('critical');
    });
  });

  describe('checkpoint visibility tracking', () => {
    it('recordCheckpointPrepared sets lastPreparedCheckpointId', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordCheckpointPrepared('cp-001', '2026-03-25T10:00:00.000Z');

      const status = sink.getCheckpointStatus();
      expect(status.lastPreparedCheckpointId).toBe('cp-001');
    });

    it('recordCheckpointCommitted sets lastCommittedCheckpointId', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordCheckpointCommitted('cp-001', '2026-03-25T10:00:00.000Z');

      const status = sink.getCheckpointStatus();
      expect(status.lastCommittedCheckpointId).toBe('cp-001');
    });

    it('getCheckpointStatus returns undefined fields when no checkpoints recorded', () => {
      const sink = new GatewayRuntimeHealthSink();
      const status = sink.getCheckpointStatus();
      expect(status.lastPreparedCheckpointId).toBeUndefined();
      expect(status.lastCommittedCheckpointId).toBeUndefined();
      expect(status.chainValid).toBeUndefined();
    });

    it('getGatewayHealth includes checkpoint fields after recording', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordCheckpointPrepared('cp-001', '2026-03-25T10:00:00.000Z');
      sink.recordCheckpointCommitted('cp-001', '2026-03-25T10:01:00.000Z');

      const health = sink.getGatewayHealth('Cortex::System');
      expect(health.lastPreparedCheckpointId).toBe('cp-001');
      expect(health.lastCommittedCheckpointId).toBe('cp-001');
    });

    it('getSystemContextReplica includes checkpoint fields after recording', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordCheckpointPrepared('cp-002', '2026-03-25T10:00:00.000Z');
      sink.recordCheckpointCommitted('cp-002', '2026-03-25T10:01:00.000Z');

      const replica = sink.getSystemContextReplica();
      expect(replica.lastPreparedCheckpointId).toBe('cp-002');
      expect(replica.lastCommittedCheckpointId).toBe('cp-002');
    });
  });

  describe('schema round-trip with .strict()', () => {
    it('GatewayHealthSnapshotSchema does not strip new escalation/checkpoint fields', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('critical', '2026-03-25T10:00:00.000Z');
      sink.recordCheckpointPrepared('cp-001', '2026-03-25T10:00:00.000Z');
      sink.recordCheckpointCommitted('cp-001', '2026-03-25T10:01:00.000Z');

      const health = sink.getGatewayHealth('Cortex::System');
      // Round-trip parse through strict schema
      const parsed = GatewayHealthSnapshotSchema.parse(health);
      expect(parsed.escalationCount).toBe(1);
      expect(parsed.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
      expect(parsed.lastEscalationSeverity).toBe('critical');
      expect(parsed.lastPreparedCheckpointId).toBe('cp-001');
      expect(parsed.lastCommittedCheckpointId).toBe('cp-001');
    });

    it('GatewayHealthSnapshotSchema parses with escalationCount: 0 boundary value', () => {
      const sink = new GatewayRuntimeHealthSink();
      const health = sink.getGatewayHealth('Cortex::System');
      // escalationCount is undefined when 0 (not projected)
      const parsed = GatewayHealthSnapshotSchema.parse(health);
      expect(parsed.escalationCount).toBeUndefined();
    });

    it('SystemContextReplicaSchema does not strip new fields', () => {
      const sink = new GatewayRuntimeHealthSink();
      sink.recordEscalation('high', '2026-03-25T10:00:00.000Z');
      sink.recordCheckpointPrepared('cp-003', '2026-03-25T10:00:00.000Z');

      const replica = sink.getSystemContextReplica();
      const parsed = SystemContextReplicaSchema.parse(replica);
      expect(parsed.escalationCount).toBe(1);
      expect(parsed.lastEscalationAt).toBe('2026-03-25T10:00:00.000Z');
      expect(parsed.lastPreparedCheckpointId).toBe('cp-003');
    });
  });


  it('projects active app sessions into system health and the system replica', () => {
    const sink = new GatewayRuntimeHealthSink();

    sink.upsertAppSession({
      session_id: 'session-1',
      app_id: 'app:weather',
      package_id: 'app:weather',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'active',
      started_at: '2026-03-17T06:00:00.000Z',
      health_status: 'healthy',
    });

    sink.recordAppHealth({
      session_id: 'session-1',
      status: 'degraded',
      reported_at: '2026-03-17T06:01:00.000Z',
      stale: false,
    });

    const systemHealth = sink.getGatewayHealth('Cortex::System');
    const principalHealth = sink.getGatewayHealth('Cortex::Principal');
    const replica = sink.getSystemContextReplica();

    expect(systemHealth.appSessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        appId: 'app:weather',
        healthStatus: 'degraded',
        stale: false,
        lastHeartbeatAt: '2026-03-17T06:01:00.000Z',
      }),
    ]);
    expect(principalHealth.appSessions).toEqual([]);
    expect(replica.appSessions).toEqual(systemHealth.appSessions);
  });

  it('removes app sessions from runtime projections during teardown', () => {
    const sink = new GatewayRuntimeHealthSink();

    sink.upsertAppSession({
      session_id: 'session-1',
      app_id: 'app:weather',
      package_id: 'app:weather',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'active',
      started_at: '2026-03-17T06:00:00.000Z',
      health_status: 'healthy',
    });

    sink.removeAppSession('session-1');

    expect(sink.getGatewayHealth('Cortex::System').appSessions).toEqual([]);
    expect(sink.getSystemContextReplica().appSessions).toEqual([]);
  });
});
