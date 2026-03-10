import { randomUUID } from 'node:crypto';
import type {
  NudgeDeliveryRecord,
  NudgeDeliverySurface,
  NudgeRankedDecision,
  NudgeReasonCode,
  NudgeSuppressionCheckResult,
  TraceEvidenceReference,
} from '@nous/shared';
import { NudgeDeliveryRecordSchema } from '@nous/shared';

export interface DeliveryEvaluationInput {
  rankedDecision: NudgeRankedDecision;
  suppressionCheck: NudgeSuppressionCheckResult;
  surface: NudgeDeliverySurface;
  authorityAllowed?: boolean;
  deliveredAt?: string;
  evidenceRefs?: readonly TraceEvidenceReference[];
}

export interface DeliveryEvaluatorOptions {
  now?: () => string;
  idFactory?: () => string;
}

function evidenceRefKey(ref: TraceEvidenceReference): string {
  return JSON.stringify(
    Object.entries(ref).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeEvidenceRefs(
  ...collections: Array<readonly TraceEvidenceReference[] | undefined>
): TraceEvidenceReference[] {
  const merged = new Map<string, TraceEvidenceReference>();
  for (const refs of collections) {
    for (const ref of refs ?? []) {
      merged.set(evidenceRefKey(ref), ref);
    }
  }
  return [...merged.values()];
}

export class DeliveryEvaluator {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: DeliveryEvaluatorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  evaluate(input: DeliveryEvaluationInput): NudgeDeliveryRecord {
    const blockedByAuthority = input.authorityAllowed === false;
    const blocked =
      blockedByAuthority ||
      input.suppressionCheck.blocked ||
      !input.rankedDecision.deliverable;
    const reasonCodes: NudgeReasonCode[] = [
      ...input.rankedDecision.reason_codes,
      ...input.suppressionCheck.reason_codes,
    ];

    if (blockedByAuthority) {
      reasonCodes.push('NDG-DELIVERY-BLOCKED-AUTHORITY');
    } else if (input.suppressionCheck.blocked) {
      reasonCodes.push('NDG-DELIVERY-BLOCKED-SUPPRESSION');
    } else if (!input.rankedDecision.deliverable) {
      reasonCodes.push('NDG-DELIVERY-BLOCKED-CONFIDENCE');
    } else {
      reasonCodes.push('NDG-DELIVERY-ALLOWED');
    }

    return NudgeDeliveryRecordSchema.parse({
      delivery_id: this.idFactory(),
      candidate_id: input.rankedDecision.decision.candidate_id,
      decision_id: input.rankedDecision.decision.decision_id,
      surface: input.surface,
      outcome: blocked ? 'delivery_blocked' : 'delivered',
      reason_codes: [...new Set(reasonCodes)],
      evidence_refs: mergeEvidenceRefs(
        input.evidenceRefs,
        input.rankedDecision.evidence_refs,
        input.suppressionCheck.evidence_refs,
      ),
      delivered_at: input.deliveredAt ?? this.now(),
    });
  }
}
