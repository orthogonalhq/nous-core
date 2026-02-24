/**
 * Verification helpers for witness ledger and checkpoint continuity.
 */
import type {
  InvariantFinding,
  InvariantSeverity,
  VerificationReportStatus,
  WitnessCheckpoint,
  WitnessEvent,
  WitnessEventId,
} from '@nous/shared';
import { createInvariantFinding } from './invariants.js';
import { buildEventPayload, buildCheckpointHash } from './ledger.js';
import { hashCanonical } from './serialization.js';

export interface EventChainVerification {
  sequenceContiguous: boolean;
  hashChainValid: boolean;
  findings: InvariantFinding[];
}

export interface CheckpointChainVerification {
  checkpointChainValid: boolean;
  signaturesValid: boolean;
  findings: InvariantFinding[];
}

export function filterEventsByRange(
  events: WitnessEvent[],
  fromSequence: number,
  toSequence: number,
): WitnessEvent[] {
  return events.filter(
    (event) => event.sequence >= fromSequence && event.sequence <= toSequence,
  );
}

export function filterCheckpointsByRange(
  checkpoints: WitnessCheckpoint[],
  fromSequence: number,
  toSequence: number,
): WitnessCheckpoint[] {
  return checkpoints.filter(
    (checkpoint) =>
      checkpoint.endEventSequence >= fromSequence &&
      checkpoint.startEventSequence <= toSequence,
  );
}

export function verifyEventChain(
  events: WitnessEvent[],
  detectedAt: string,
): EventChainVerification {
  const findings: InvariantFinding[] = [];
  let sequenceContiguous = true;
  let hashChainValid = true;

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const expectedSequence = i === 0 ? events[0]!.sequence : events[i - 1]!.sequence + 1;
    if (event.sequence !== expectedSequence) {
      sequenceContiguous = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-SEQUENCE-GAP',
          description: `sequence gap at event ${event.id}`,
          evidenceEventIds: [event.id as WitnessEventId],
          detectedAt,
        }),
      );
    }

    const payload = buildEventPayload({
      stage: event.stage,
      actionCategory: event.actionCategory,
      actionRef: event.actionRef,
      authorizationRef: event.authorizationRef,
      traceId: event.traceId,
      projectId: event.projectId,
      actor: event.actor,
      status: event.status,
      invariantCode: event.invariantCode,
      detail: event.detail,
      occurredAt: event.occurredAt,
    });

    const payloadHash = hashCanonical(payload);
    if (payloadHash !== event.payloadHash) {
      hashChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-PAYLOAD-HASH-MISMATCH',
          description: `payload hash mismatch at event ${event.id}`,
          evidenceEventIds: [event.id as WitnessEventId],
          detectedAt,
        }),
      );
    }

    const expectedPreviousHash = i === 0 ? null : events[i - 1]!.eventHash;
    if (event.previousEventHash !== expectedPreviousHash) {
      hashChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-PREVIOUS-HASH-MISMATCH',
          description: `previous hash mismatch at event ${event.id}`,
          evidenceEventIds: [event.id as WitnessEventId],
          detectedAt,
        }),
      );
    }

    const eventHash = hashCanonical({
      sequence: event.sequence,
      previousEventHash: event.previousEventHash,
      payloadHash: event.payloadHash,
    });
    if (eventHash !== event.eventHash) {
      hashChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-EVENT-HASH-MISMATCH',
          description: `event hash mismatch at event ${event.id}`,
          evidenceEventIds: [event.id as WitnessEventId],
          detectedAt,
        }),
      );
    }
  }

  return { sequenceContiguous, hashChainValid, findings };
}

export async function verifyCheckpointChain(
  checkpoints: WitnessCheckpoint[],
  events: WitnessEvent[],
  detectedAt: string,
  verifySignatureForCheckpoint: (checkpoint: WitnessCheckpoint) => Promise<boolean>,
): Promise<CheckpointChainVerification> {
  const findings: InvariantFinding[] = [];
  let checkpointChainValid = true;
  let signaturesValid = true;
  const eventBySequence = new Map(events.map((event) => [event.sequence, event]));

  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i]!;
    const previous = checkpoints[i - 1];

    if (previous && checkpoint.checkpointSequence !== previous.checkpointSequence + 1) {
      checkpointChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-CHECKPOINT-SEQUENCE-GAP',
          description: `checkpoint sequence gap at ${checkpoint.id}`,
          evidenceEventIds: [],
          detectedAt,
        }),
      );
    }

    if ((previous?.checkpointHash ?? null) !== checkpoint.previousCheckpointHash) {
      checkpointChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-CHECKPOINT-LINK-BROKEN',
          description: `checkpoint link mismatch at ${checkpoint.id}`,
          evidenceEventIds: [],
          detectedAt,
        }),
      );
    }

    const expectedCheckpointHash = buildCheckpointHash({
      checkpointSequence: checkpoint.checkpointSequence,
      startEventSequence: checkpoint.startEventSequence,
      endEventSequence: checkpoint.endEventSequence,
      previousCheckpointHash: checkpoint.previousCheckpointHash,
      ledgerHeadHash: checkpoint.ledgerHeadHash,
      keyEpoch: checkpoint.keyEpoch,
      reason: checkpoint.reason,
    });

    if (expectedCheckpointHash !== checkpoint.checkpointHash) {
      checkpointChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-CHECKPOINT-HASH-MISMATCH',
          description: `checkpoint hash mismatch at ${checkpoint.id}`,
          evidenceEventIds: [],
          detectedAt,
        }),
      );
    }

    const headEvent = eventBySequence.get(checkpoint.endEventSequence);
    if (!headEvent || headEvent.eventHash !== checkpoint.ledgerHeadHash) {
      checkpointChainValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-CHECKPOINT-LEDGER-HEAD-MISMATCH',
          description: `checkpoint ledger head mismatch at ${checkpoint.id}`,
          evidenceEventIds: headEvent ? [headEvent.id as WitnessEventId] : [],
          detectedAt,
        }),
      );
    }

    const signatureValid = await verifySignatureForCheckpoint(checkpoint);
    if (!signatureValid) {
      signaturesValid = false;
      findings.push(
        createInvariantFinding({
          code: 'CHAIN-CHECKPOINT-SIGNATURE-INVALID',
          description: `checkpoint signature invalid at ${checkpoint.id}`,
          evidenceEventIds: [],
          detectedAt,
        }),
      );
    }
  }

  return { checkpointChainValid, signaturesValid, findings };
}

export function collectInvariantEventFindings(
  events: WitnessEvent[],
  detectedAt: string,
): InvariantFinding[] {
  const findings: InvariantFinding[] = [];

  for (const event of events) {
    if (event.stage !== 'invariant' || !event.invariantCode) {
      continue;
    }

    const rawEvidenceIds = event.detail.evidenceEventIds;
    const evidenceEventIds: WitnessEventId[] = Array.isArray(rawEvidenceIds)
      ? rawEvidenceIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id as WitnessEventId)
      : [event.id as WitnessEventId];

    const description = typeof event.detail.description === 'string'
      ? event.detail.description
      : `invariant signaled by ${event.actor}`;

    findings.push(
      createInvariantFinding({
        code: event.invariantCode,
        description,
        evidenceEventIds,
        detectedAt,
      }),
    );
  }

  return findings;
}

export function countFindingsBySeverity(
  findings: InvariantFinding[],
): { S0: number; S1: number; S2: number } {
  const counts: Record<InvariantSeverity, number> = {
    S0: 0,
    S1: 0,
    S2: 0,
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  return counts;
}

export function deriveVerificationStatus(
  bySeverity: { S0: number; S1: number; S2: number },
): VerificationReportStatus {
  if (bySeverity.S0 > 0) {
    return 'fail';
  }
  if (bySeverity.S1 > 0 || bySeverity.S2 > 0) {
    return 'review';
  }
  return 'pass';
}
