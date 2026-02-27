import { describe, it, expect } from 'vitest';
import {
  AttestationReceiptSchema,
  CriticalActionCategorySchema,
  InvariantCodeSchema,
  InvariantPrefixSchema,
  InvariantSeveritySchema,
  TraceEvidenceReferenceSchema,
  VerificationReportSchema,
  WitnessCheckpointSchema,
  WitnessEventSchema,
} from '../../types/evidence.js';

const NOW = new Date().toISOString();
const UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

describe('InvariantCodeSchema', () => {
  it('accepts documented taxonomy prefixes', () => {
    expect(InvariantCodeSchema.safeParse('AUTH-MISSING-PRECALL').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('EVID-MISSING-COMPLETION').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('MEM-AUTHORITY-VIOLATION').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('CHAIN-HASH-MISMATCH').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('ISO-APPEND-ONLY-VIOLATION').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('PRV-AUTH-FAILURE').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PRV-THRESHOLD-MISS').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PRV-PROFILE-BOUNDARY').success).toBe(
      true,
    );
    expect(InvariantCodeSchema.safeParse('OPCTL-001').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('START-002').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('ESC-001').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('POL-DENIED').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('WMODE-001').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('WMODE-002').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('WMODE-010').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PCP-001').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PCP-002').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PCP-007').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PCP-008').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('PCP-009').success).toBe(true);
  });

  it('rejects unknown prefix', () => {
    expect(InvariantCodeSchema.safeParse('NET-TIMEOUT').success).toBe(false);
  });
});

describe('CriticalActionCategorySchema', () => {
  it('accepts supported categories', () => {
    expect(CriticalActionCategorySchema.safeParse('opctl-command').success).toBe(
      true,
    );
    expect(CriticalActionCategorySchema.safeParse('model-invoke').success).toBe(
      true,
    );
    expect(CriticalActionCategorySchema.safeParse('tool-execute').success).toBe(
      true,
    );
    expect(CriticalActionCategorySchema.safeParse('memory-write').success).toBe(
      true,
    );
    expect(CriticalActionCategorySchema.safeParse('trace-persist').success).toBe(
      true,
    );
  });
});

describe('WitnessEventSchema', () => {
  it('accepts authorization event', () => {
    const result = WitnessEventSchema.safeParse({
      id: UUID_1,
      sequence: 1,
      previousEventHash: null,
      payloadHash: HASH,
      eventHash: HASH,
      stage: 'authorization',
      actionCategory: 'model-invoke',
      actionRef: 'reasoner',
      traceId: UUID_2,
      projectId: UUID_2,
      actor: 'core',
      status: 'approved',
      detail: {},
      occurredAt: NOW,
      recordedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('WitnessCheckpointSchema', () => {
  it('accepts checkpoint structure', () => {
    const result = WitnessCheckpointSchema.safeParse({
      id: UUID_1,
      checkpointSequence: 1,
      startEventSequence: 1,
      endEventSequence: 10,
      previousCheckpointHash: null,
      checkpointHash: HASH,
      ledgerHeadHash: HASH,
      keyEpoch: 1,
      signatureAlgorithm: 'ed25519',
      signature: 'signature',
      reason: 'interval',
      createdAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('AttestationReceiptSchema', () => {
  it('accepts local attestation receipt', () => {
    const result = AttestationReceiptSchema.safeParse({
      id: UUID_1,
      mode: 'local',
      subjectType: 'verification-report',
      subjectHash: HASH,
      keyEpoch: 1,
      signatureAlgorithm: 'ed25519',
      signature: 'signature',
      verified: true,
      issuedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('VerificationReportSchema', () => {
  it('accepts report with severity counts', () => {
    const result = VerificationReportSchema.safeParse({
      id: UUID_1,
      generatedAt: NOW,
      range: {
        fromSequence: 1,
        toSequence: 10,
      },
      ledger: {
        eventCount: 10,
        headEventHash: HASH,
        sequenceContiguous: true,
        hashChainValid: true,
      },
      checkpoints: {
        checkpointCount: 1,
        headCheckpointHash: HASH,
        checkpointChainValid: true,
        signaturesValid: true,
      },
      invariants: {
        findings: [
          {
            code: 'EVID-MISSING-COMPLETION',
            severity: 'S1',
            enforcement: 'auto-pause',
            description: 'missing completion event',
            evidenceEventIds: [UUID_2],
            detectedAt: NOW,
          },
        ],
        bySeverity: {
          S0: 0,
          S1: 1,
          S2: 0,
        },
      },
      status: 'review',
      receipt: {
        id: UUID_2,
        mode: 'local',
        subjectType: 'verification-report',
        subjectHash: HASH,
        keyEpoch: 1,
        signatureAlgorithm: 'ed25519',
        signature: 'signature',
        verified: true,
        issuedAt: NOW,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invariants.bySeverity.S1).toBe(1);
    }
  });
});

describe('TraceEvidenceReferenceSchema', () => {
  it('accepts turn-level evidence reference', () => {
    const result = TraceEvidenceReferenceSchema.safeParse({
      actionCategory: 'memory-write',
      authorizationEventId: UUID_1,
      completionEventId: UUID_2,
      verificationReportId: UUID_1,
    });

    expect(result.success).toBe(true);
  });
});

describe('InvariantPrefixSchema', () => {
  it('includes PCP for project-chat-control-plane', () => {
    expect(InvariantPrefixSchema.safeParse('PCP').success).toBe(true);
  });
});

describe('InvariantSeveritySchema', () => {
  it('only accepts S0/S1/S2', () => {
    expect(InvariantSeveritySchema.safeParse('S0').success).toBe(true);
    expect(InvariantSeveritySchema.safeParse('S1').success).toBe(true);
    expect(InvariantSeveritySchema.safeParse('S2').success).toBe(true);
    expect(InvariantSeveritySchema.safeParse('S3').success).toBe(false);
  });
});
