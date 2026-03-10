import type {
  IDocumentStore,
  NudgeDeliveryRecord,
  NudgeFeedbackRecord,
  NudgeRankingPolicy,
  NudgeSignalRecord,
  NudgeSuppressionRecord,
} from '@nous/shared';
import {
  NudgeDeliveryRecordSchema,
  NudgeFeedbackRecordSchema,
  NudgeRankingPolicySchema,
  NudgeSignalRecordSchema,
  NudgeSuppressionRecordSchema,
} from '@nous/shared';

export const NUDGE_SIGNAL_COLLECTION = 'nudge_signals';
export const NUDGE_RANKING_POLICY_COLLECTION = 'nudge_ranking_policies';
export const NUDGE_SUPPRESSION_COLLECTION = 'nudge_suppressions';
export const NUDGE_DELIVERY_COLLECTION = 'nudge_deliveries';
export const NUDGE_FEEDBACK_COLLECTION = 'nudge_feedback';

function parseSignal(value: unknown): NudgeSignalRecord | null {
  const parsed = NudgeSignalRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parsePolicy(value: unknown): NudgeRankingPolicy | null {
  const parsed = NudgeRankingPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseSuppression(value: unknown): NudgeSuppressionRecord | null {
  const parsed = NudgeSuppressionRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseDelivery(value: unknown): NudgeDeliveryRecord | null {
  const parsed = NudgeDeliveryRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseFeedback(value: unknown): NudgeFeedbackRecord | null {
  const parsed = NudgeFeedbackRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentNudgeStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async saveSignal(record: NudgeSignalRecord): Promise<NudgeSignalRecord> {
    const validated = NudgeSignalRecordSchema.parse(record);
    await this.documentStore.put(NUDGE_SIGNAL_COLLECTION, validated.signal_id, validated);
    return validated;
  }

  async getSignal(signalId: string): Promise<NudgeSignalRecord | null> {
    const raw = await this.documentStore.get<unknown>(NUDGE_SIGNAL_COLLECTION, signalId);
    return parseSignal(raw);
  }

  async listSignals(): Promise<NudgeSignalRecord[]> {
    const raw = await this.documentStore.query<unknown>(NUDGE_SIGNAL_COLLECTION, {
      orderBy: 'created_at',
      orderDirection: 'desc',
    });
    return raw
      .map(parseSignal)
      .filter((value): value is NudgeSignalRecord => value !== null);
  }

  async saveRankingPolicy(record: NudgeRankingPolicy): Promise<NudgeRankingPolicy> {
    const validated = NudgeRankingPolicySchema.parse(record);
    await this.documentStore.put(
      NUDGE_RANKING_POLICY_COLLECTION,
      validated.policy_id,
      validated,
    );
    return validated;
  }

  async getRankingPolicyByVersion(version: string): Promise<NudgeRankingPolicy | null> {
    const raw = await this.documentStore.query<unknown>(NUDGE_RANKING_POLICY_COLLECTION, {
      where: { version },
      orderBy: 'effective_at',
      orderDirection: 'desc',
      limit: 1,
    });
    return parsePolicy(raw[0] ?? null);
  }

  async listRankingPolicies(): Promise<NudgeRankingPolicy[]> {
    const raw = await this.documentStore.query<unknown>(NUDGE_RANKING_POLICY_COLLECTION, {
      orderBy: 'effective_at',
      orderDirection: 'desc',
    });
    return raw
      .map(parsePolicy)
      .filter((value): value is NudgeRankingPolicy => value !== null);
  }

  async saveSuppression(record: NudgeSuppressionRecord): Promise<NudgeSuppressionRecord> {
    const validated = NudgeSuppressionRecordSchema.parse(record);
    await this.documentStore.put(
      NUDGE_SUPPRESSION_COLLECTION,
      validated.suppression_id,
      validated,
    );
    return validated;
  }

  async listSuppressions(): Promise<NudgeSuppressionRecord[]> {
    const raw = await this.documentStore.query<unknown>(NUDGE_SUPPRESSION_COLLECTION, {
      orderBy: 'created_at',
      orderDirection: 'desc',
    });
    return raw
      .map(parseSuppression)
      .filter((value): value is NudgeSuppressionRecord => value !== null);
  }

  async saveDelivery(record: NudgeDeliveryRecord): Promise<NudgeDeliveryRecord> {
    const validated = NudgeDeliveryRecordSchema.parse(record);
    await this.documentStore.put(NUDGE_DELIVERY_COLLECTION, validated.delivery_id, validated);
    return validated;
  }

  async listDeliveriesByCandidate(candidateId: string): Promise<NudgeDeliveryRecord[]> {
    const raw = await this.documentStore.query<unknown>(NUDGE_DELIVERY_COLLECTION, {
      where: { candidate_id: candidateId },
      orderBy: 'delivered_at',
      orderDirection: 'desc',
    });
    return raw
      .map(parseDelivery)
      .filter((value): value is NudgeDeliveryRecord => value !== null);
  }

  async saveFeedback(record: NudgeFeedbackRecord): Promise<NudgeFeedbackRecord> {
    const validated = NudgeFeedbackRecordSchema.parse(record);
    await this.documentStore.put(NUDGE_FEEDBACK_COLLECTION, validated.feedback_id, validated);
    return validated;
  }

  async listFeedbackByCandidate(candidateId: string): Promise<NudgeFeedbackRecord[]> {
    const raw = await this.documentStore.query<unknown>(NUDGE_FEEDBACK_COLLECTION, {
      where: { candidate_id: candidateId },
      orderBy: 'occurred_at',
      orderDirection: 'desc',
    });
    return raw
      .map(parseFeedback)
      .filter((value): value is NudgeFeedbackRecord => value !== null);
  }
}
