import { randomUUID } from 'node:crypto';
import type {
  CommunicationIdentityBindingRecord,
  CommunicationIdentityBindingUpsertInput,
} from '@nous/shared';
import { CommunicationIdentityBindingUpsertInputSchema } from '@nous/shared';
import { DocumentCommunicationStore } from './document-communication-store.js';

export interface BindingStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class BindingStore {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(
    private readonly store: DocumentCommunicationStore,
    options: BindingStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async upsert(
    input: CommunicationIdentityBindingUpsertInput,
  ): Promise<CommunicationIdentityBindingRecord> {
    const parsed = CommunicationIdentityBindingUpsertInputSchema.parse(input);
    const existing = await this.store.findBindingByIdentity({
      channel: parsed.channel,
      account_id: parsed.account_id,
      channel_identity: parsed.channel_identity,
    });
    const timestamp = this.now();

    return this.store.saveBinding({
      binding_id: existing?.binding_id ?? this.idFactory(),
      channel: parsed.channel,
      account_id: parsed.account_id,
      channel_identity: parsed.channel_identity,
      principal_id: parsed.principal_id,
      state: parsed.requested_state,
      approved_by: parsed.approved_by,
      approved_at: parsed.requested_state === 'active' ? timestamp : existing?.approved_at,
      revoked_at: parsed.requested_state === 'revoked' ? timestamp : undefined,
      failover_group_ref: parsed.failover_group_ref ?? existing?.failover_group_ref,
      evidence_refs: [
        ...new Set([...(existing?.evidence_refs ?? []), ...parsed.evidence_refs]),
      ],
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    });
  }

  async get(bindingId: string): Promise<CommunicationIdentityBindingRecord | null> {
    return this.store.getBinding(bindingId);
  }

  async findByIdentity(input: {
    channel: CommunicationIdentityBindingRecord['channel'];
    account_id: string;
    channel_identity: string;
  }): Promise<CommunicationIdentityBindingRecord | null> {
    return this.store.findBindingByIdentity(input);
  }

  async listByFailoverGroup(
    failoverGroupRef: string,
  ): Promise<CommunicationIdentityBindingRecord[]> {
    return this.store.listBindingsByFailoverGroup(failoverGroupRef);
  }
}
