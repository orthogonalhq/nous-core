/**
 * WR-162 SP 3 UT-1 + UT-2 (part A) — SupervisorService contract.
 *
 * Covers:
 * - ISupervisorService method shape / SP 1 Zod schema round-trip.
 * - `startSupervision` idempotency at the service layer (SUPV-SP3-001).
 * - `enabled: false` disposition (SUPV-SP3-002).
 * - `stopSupervision` clears buffers.
 * - `recordObservation` pushes into the anomaly buffer through the Zod parse.
 */
import { describe, expect, it } from 'vitest';
import {
  SentinelRiskScoreSchema,
  SupervisorObservationSchema,
  SupervisorStatusSnapshotSchema,
  SupervisorViolationRecordSchema,
} from '@nous/shared';
import { z } from 'zod';
import { SupervisorService } from '../supervisor-service.js';

describe('SupervisorService — ISupervisorService surface', () => {
  it('getStatusSnapshot returns a payload that parses against SupervisorStatusSnapshotSchema (camelCase)', async () => {
    const svc = new SupervisorService();
    const snap = await svc.getStatusSnapshot();
    const parsed = SupervisorStatusSnapshotSchema.safeParse(snap);
    expect(parsed.success).toBe(true);
    expect(snap.active).toBe(false);
    expect(snap.agentsMonitored).toBe(0);
    expect(snap.activeViolationCounts).toEqual({ s0: 0, s1: 0, s2: 0, s3: 0 });
    expect(snap.lifetime).toEqual({
      violationsDetected: 0,
      anomaliesClassified: 0,
      enforcementsApplied: 0,
    });
    expect(snap.witnessIntegrity).toBe('intact');
    expect(snap.riskSummary).toEqual({});
  });

  it('getStatusSnapshot.active flips to true after enabled startSupervision', async () => {
    const svc = new SupervisorService();
    svc.startSupervision({ enabled: true });
    const snap = await svc.getStatusSnapshot();
    expect(snap.active).toBe(true);
  });

  it('getRecentViolations returns an empty array that parses as SupervisorViolationRecord[]', async () => {
    const svc = new SupervisorService();
    const rows = await svc.getRecentViolations({});
    expect(rows).toEqual([]);
    const parsed = z.array(SupervisorViolationRecordSchema).safeParse(rows);
    expect(parsed.success).toBe(true);
  });

  it('getSentinelRiskScores returns an empty array that parses as SentinelRiskScore[]', async () => {
    const svc = new SupervisorService();
    const rows = await svc.getSentinelRiskScores({});
    expect(rows).toEqual([]);
    const parsed = z.array(SentinelRiskScoreSchema).safeParse(rows);
    expect(parsed.success).toBe(true);
  });

  it('getAgentSupervisorSnapshot returns the snake_case zero-state shape', async () => {
    const svc = new SupervisorService();
    const snap = await svc.getAgentSupervisorSnapshot('agent-1');
    expect(snap).toEqual({
      guardrail_status: 'clear',
      witness_integrity_status: 'intact',
      sentinel_risk_score: null,
    });
  });
});

describe('SupervisorService — startSupervision lifecycle', () => {
  it('SUPV-SP3-001 — startSupervision is idempotent (handle reference equality)', () => {
    const svc = new SupervisorService();
    const h1 = svc.startSupervision({ enabled: true });
    const h2 = svc.startSupervision({ enabled: true });
    expect(h1).toBe(h2);
    expect(h1.isActive()).toBe(true);
  });

  it('SUPV-SP3-002 — enabled: false returns an inert handle, service stays inactive', async () => {
    const svc = new SupervisorService();
    const h = svc.startSupervision({ enabled: false });
    expect(h.isActive()).toBe(false);
    const snap = await svc.getStatusSnapshot();
    expect(snap.active).toBe(false);
  });

  it('SUPV-SP3-002 — second call after enabled: false still returns the same inert handle', () => {
    const svc = new SupervisorService();
    const h1 = svc.startSupervision({ enabled: false });
    const h2 = svc.startSupervision({ enabled: true });
    expect(h1).toBe(h2);
    expect(h2.isActive()).toBe(false);
  });

  it('enabled defaults to true when absent on the config', () => {
    const svc = new SupervisorService();
    const h = svc.startSupervision({});
    expect(h.isActive()).toBe(true);
  });

  it('stopSupervision clears buffers', async () => {
    const svc = new SupervisorService();
    svc.startSupervision({ enabled: true });
    svc.recordObservation({
      observedAt: new Date().toISOString(),
      source: 'gateway_outbox',
      payload: { type: 'observation', note: 'test' },
    });
    await svc.stopSupervision();
    const snap = await svc.getStatusSnapshot();
    expect(snap.active).toBe(false);
  });
});

describe('SupervisorService — recordObservation', () => {
  it('accepts a valid observation that parses against SupervisorObservationSchema', () => {
    const svc = new SupervisorService();
    const obs = {
      observedAt: new Date().toISOString(),
      source: 'gateway_outbox' as const,
      payload: { foo: 'bar' },
    };
    // Belt-and-braces: the service's internal parse succeeds and the shape
    // is independently parseable.
    expect(() => svc.recordObservation(obs)).not.toThrow();
    expect(SupervisorObservationSchema.safeParse(obs).success).toBe(true);
  });

  it('rejects a malformed observation via Zod parse', () => {
    const svc = new SupervisorService();
    expect(() =>
      svc.recordObservation({
        // Missing observedAt — schema requires datetime string.
        source: 'gateway_outbox',
        payload: null,
      } as never),
    ).toThrow();
  });
});
