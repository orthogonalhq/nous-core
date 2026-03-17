import { describe, expect, it } from 'vitest';
import { AppHealthRegistry } from '../app-health-registry.js';

describe('AppHealthRegistry', () => {
  it('marks skipped heartbeat sequences as degraded', () => {
    const registry = new AppHealthRegistry({
      now: () => new Date('2026-03-17T00:00:00.000Z'),
    });
    registry.initializeSession('session-1');
    registry.recordHeartbeat({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:01.000Z',
      sequence: 0,
    });

    const snapshot = registry.recordHeartbeat({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:03.000Z',
      sequence: 2,
    });

    expect(snapshot.status).toBe('degraded');
    expect(snapshot.details.reason).toBe('heartbeat_sequence_gap');
  });

  it('marks stale sessions when heartbeat freshness expires', () => {
    const registry = new AppHealthRegistry({
      now: () => new Date('2026-03-17T00:01:00.000Z'),
    });
    registry.updateSnapshot({
      session_id: 'session-1',
      status: 'healthy',
      reported_at: '2026-03-17T00:00:00.000Z',
      stale: false,
      details: {},
    });

    const stale = registry.markStaleSessions(1000);
    expect(stale[0]?.status).toBe('stale');
    expect(stale[0]?.stale).toBe(true);
  });
});
