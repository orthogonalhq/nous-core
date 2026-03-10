import type { NudgeFeedbackRecord } from '@nous/shared';
import { DocumentNudgeStore } from './document-nudge-store.js';

export class FeedbackStore {
  constructor(private readonly store: DocumentNudgeStore) {}

  async save(record: NudgeFeedbackRecord): Promise<NudgeFeedbackRecord> {
    return this.store.saveFeedback(record);
  }

  async listByCandidate(candidateId: string): Promise<NudgeFeedbackRecord[]> {
    return this.store.listFeedbackByCandidate(candidateId);
  }
}
