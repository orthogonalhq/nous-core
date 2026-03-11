import { randomUUID } from 'node:crypto';
import type { NudgeSignalRecord, NudgeSignalRecordInput } from '@nous/shared';
import { NudgeSignalRecordInputSchema, NudgeSignalRecordSchema } from '@nous/shared';
import { DocumentNudgeStore } from './document-nudge-store.js';

export interface SignalRecorderOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class SignalRecorder {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(
    private readonly store: DocumentNudgeStore,
    options: SignalRecorderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async record(input: NudgeSignalRecordInput): Promise<NudgeSignalRecord> {
    const parsed = NudgeSignalRecordInputSchema.parse(input);
    const record = NudgeSignalRecordSchema.parse({
      signal_id: this.idFactory(),
      signal_type: parsed.signal_type,
      target_scope: parsed.target_scope,
      source_refs: parsed.source_refs,
      requesting_project_id: parsed.requesting_project_id,
      trace_id: parsed.trace_id,
      evidence_refs: parsed.evidence_refs,
      created_at: this.now(),
    });

    return this.store.saveSignal(record);
  }
}
