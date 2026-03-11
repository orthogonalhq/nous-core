import { randomUUID } from 'node:crypto';
import type {
  ChannelIngressEnvelope,
  CommunicationApprovalIntakeRecord,
} from '@nous/shared';
import { DocumentCommunicationStore } from './document-communication-store.js';

export interface ApprovalIntakeStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class ApprovalIntakeStore {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(
    private readonly store: DocumentCommunicationStore,
    options: ApprovalIntakeStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async recordFromIngress(
    envelope: ChannelIngressEnvelope,
    evidenceRefs: readonly string[],
  ): Promise<CommunicationApprovalIntakeRecord> {
    const existing = await this.store.findApprovalIntake({
      channel: envelope.channel,
      account_id: envelope.account_id,
      conversation_id: envelope.conversation_id,
      channel_identity: envelope.sender_channel_identity,
    });
    const timestamp = this.now();

    return this.store.saveApprovalIntake({
      intake_id: existing?.intake_id ?? this.idFactory(),
      channel: envelope.channel,
      account_id: envelope.account_id,
      conversation_id: envelope.conversation_id,
      channel_identity: envelope.sender_channel_identity,
      latest_ingress_id: envelope.ingress_id,
      status: existing?.status ?? 'pending',
      evidence_refs: [...new Set([...(existing?.evidence_refs ?? []), ...evidenceRefs])],
      first_seen_at: existing?.first_seen_at ?? timestamp,
      last_seen_at: timestamp,
    });
  }

  async list(_projectId?: string): Promise<CommunicationApprovalIntakeRecord[]> {
    return this.store.listApprovalIntake();
  }
}
