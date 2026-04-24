/**
 * UT-W1..UT-W3 — witness-emission helpers.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  IWitnessService,
  SupervisorViolationRecord,
  WitnessEvent,
} from '@nous/shared';
import {
  emitDetectionWitness,
  emitEnforcementWitness,
} from '../witness-emission.js';

const ISO = '2026-04-22T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '550e8400-e29b-41d4-a716-446655440002';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

function violation(): SupervisorViolationRecord {
  return {
    supCode: 'SUP-001',
    severity: 'S0',
    agentId: AGENT_ID,
    agentClass: 'Worker',
    runId: RUN_ID,
    projectId: PROJECT_ID,
    evidenceRefs: [],
    detectedAt: ISO,
    enforcement: null,
  };
}

function mockWitnessService(): {
  service: IWitnessService;
  calls: Parameters<IWitnessService['appendInvariant']>[0][];
} {
  const calls: Parameters<IWitnessService['appendInvariant']>[0][] = [];
  const service = {
    appendInvariant: vi.fn(async (input) => {
      calls.push(input);
      const event: Partial<WitnessEvent> = {
        id: EVENT_ID as never,
        invariantCode: input.code,
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
      };
      return event as WitnessEvent;
    }),
    appendAuthorization: vi.fn(),
    appendCompletion: vi.fn(),
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  } as unknown as IWitnessService;
  return { service, calls };
}

describe('emitDetectionWitness (UT-W1, UT-W3)', () => {
  it('invokes appendInvariant exactly once with actionCategory supervisor-detection and returns the event id', async () => {
    const { service, calls } = mockWitnessService();
    const id = await emitDetectionWitness({
      violation: violation(),
      reason: 'worker dispatch_agent',
      witnessService: service,
    });
    expect(id).toBe(EVENT_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.actionCategory).toBe('supervisor-detection');
    expect(calls[0]?.actionRef).toBe(`SUP-001-${RUN_ID}`);
    expect(calls[0]?.detail.severity).toBe('S0');
    expect(calls[0]?.detail.supervisorActor).toBe('supervisor');
    expect(calls[0]?.code).toBe('SUP-001');
  });
});

describe('emitEnforcementWitness (UT-W2)', () => {
  it('invokes appendInvariant with actionCategory supervisor-enforcement and full payload', async () => {
    const { service, calls } = mockWitnessService();
    const id = await emitEnforcementWitness({
      supCode: 'SUP-001',
      severity: 'S0',
      action: 'hard_stop',
      commandId: 'cmd-42',
      agentId: AGENT_ID,
      agentClass: 'Worker',
      runId: RUN_ID,
      projectId: PROJECT_ID,
      evidenceRefs: ['evt-1', 'evt-2'],
      enforcedAt: ISO,
      witnessService: service,
    });
    expect(id).toBe(EVENT_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.actionCategory).toBe('supervisor-enforcement');
    expect(calls[0]?.actionRef).toBe('SUP-001-cmd-42');
    expect(calls[0]?.detail.commandId).toBe('cmd-42');
    expect(calls[0]?.detail.action).toBe('hard_stop');
    expect(calls[0]?.detail.evidenceRefs).toEqual(['evt-1', 'evt-2']);
  });
});
