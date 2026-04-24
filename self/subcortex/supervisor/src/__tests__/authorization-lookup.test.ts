/**
 * UT-AL1 — authorization-lookup helper.
 */
import { describe, expect, it } from 'vitest';
import type { IWitnessService, WitnessEvent } from '@nous/shared';
import { hasAuthorizationForAction } from '../authorization-lookup.js';

const ISO = '2026-04-22T00:00:00.000Z';

function authEvent(overrides: Partial<WitnessEvent> = {}): WitnessEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000' as never,
    sequence: 1,
    previousEventHash: null,
    payloadHash: 'a'.repeat(64),
    eventHash: 'b'.repeat(64),
    stage: 'authorization',
    actionCategory: 'opctl-command',
    actionRef: 'operator.pause_run#abc',
    actor: 'system',
    status: 'approved',
    detail: {},
    occurredAt: ISO,
    recordedAt: ISO,
    ...overrides,
  };
}

const stubWitness = {} as IWitnessService;

describe('hasAuthorizationForAction', () => {
  it('returns true when ledger contains a matching approved authorization event', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#abc' },
      async () => [authEvent()],
    );
    expect(result).toBe(true);
  });

  it('returns false when ledger is empty', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#abc' },
      async () => [],
    );
    expect(result).toBe(false);
  });

  it('returns false when actionRef does not match', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#OTHER' },
      async () => [authEvent()],
    );
    expect(result).toBe(false);
  });

  it('returns false when matching event is NOT in authorization stage', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#abc' },
      async () => [authEvent({ stage: 'completion' })],
    );
    expect(result).toBe(false);
  });

  it('returns false when matching event is denied', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#abc' },
      async () => [authEvent({ status: 'denied' })],
    );
    expect(result).toBe(false);
  });

  it('returns false when reader throws (safe-default)', async () => {
    const result = await hasAuthorizationForAction(
      stubWitness,
      { actionCategory: 'opctl-command', actionRef: 'operator.pause_run#abc' },
      async () => {
        throw new Error('bang');
      },
    );
    expect(result).toBe(false);
  });
});
