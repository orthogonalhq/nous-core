import { describe, expect, it } from 'vitest';
import { GatewayRuntimeHealthSink } from '../../gateway-runtime/runtime-health.js';

describe('GatewayRuntimeHealthSink', () => {
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
