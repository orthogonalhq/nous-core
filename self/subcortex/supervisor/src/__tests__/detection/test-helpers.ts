/**
 * Shared detector-test helpers — observation + detector-context builders.
 *
 * These helpers keep each detector test file small and make the positive /
 * negative / adjacent-negative fixture triads obvious at a glance.
 */
import type { SupervisorObservation, VerificationReport } from '@nous/shared';
import type { DetectorContext } from '../../detection/types.js';

const ISO = '2026-04-22T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '550e8400-e29b-41d4-a716-446655440002';

export function baseObservation(
  overrides: Partial<SupervisorObservation> = {},
): SupervisorObservation {
  return {
    observedAt: ISO,
    source: 'gateway_outbox',
    payload: null,
    agentId: AGENT_ID,
    agentClass: 'Worker',
    runId: RUN_ID,
    projectId: PROJECT_ID,
    traceId: null,
    toolCall: null,
    routingTarget: null,
    lifecycleTransition: null,
    actionClaim: null,
    ...overrides,
  };
}

export function passingVerify(): VerificationReport {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010' as never,
    generatedAt: ISO,
    range: { fromSequence: 0, toSequence: 0 },
    ledger: {
      eventCount: 0,
      headEventHash: null,
      sequenceContiguous: true,
      hashChainValid: true,
    },
    checkpoints: {
      checkpointCount: 0,
      headCheckpointHash: null,
      checkpointChainValid: true,
      signaturesValid: true,
    },
    invariants: {
      findings: [],
      bySeverity: { S0: 0, S1: 0, S2: 0 },
    },
    status: 'pass',
    receipt: {
      id: '550e8400-e29b-41d4-a716-446655440011' as never,
      mode: 'local',
      subjectType: 'verification-report',
      subjectHash: 'a'.repeat(64),
      keyEpoch: 1,
      signatureAlgorithm: 'ed25519',
      signature: 'sig',
      verified: true,
      issuedAt: ISO,
    },
  };
}

export function buildContext(
  overrides: Partial<DetectorContext> = {},
): DetectorContext {
  return Object.freeze({
    now: () => ISO,
    budget: null,
    toolSurface: null,
    witness: {
      verify: async () => passingVerify(),
      hasAuthorizationForAction: async () => false,
      ...(overrides.witness ?? {}),
    },
    ...overrides,
  });
}
