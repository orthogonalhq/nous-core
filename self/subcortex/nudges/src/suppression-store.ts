import type { NudgeSuppressionRecord } from '@nous/shared';
import { DocumentNudgeStore } from './document-nudge-store.js';

export class SuppressionStore {
  constructor(private readonly store: DocumentNudgeStore) {}

  async save(record: NudgeSuppressionRecord): Promise<NudgeSuppressionRecord> {
    return this.store.saveSuppression(record);
  }

  async list(): Promise<NudgeSuppressionRecord[]> {
    return this.store.listSuppressions();
  }
}
