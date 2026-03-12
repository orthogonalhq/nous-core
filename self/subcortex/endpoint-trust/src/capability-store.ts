import { randomUUID } from 'node:crypto';
import type {
  EndpointCapabilityGrantInput,
  EndpointCapabilityGrantRecord,
  EndpointCapabilityRevocationInput,
} from '@nous/shared';
import { EndpointCapabilityGrantRecordSchema } from '@nous/shared';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';

export interface CapabilityStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class CapabilityStore {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentEndpointTrustStore,
    private readonly options: CapabilityStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async grant(input: EndpointCapabilityGrantInput): Promise<EndpointCapabilityGrantRecord> {
    const record = EndpointCapabilityGrantRecordSchema.parse({
      grant_id: input.grant_id ?? this.nextId(),
      endpoint_id: input.endpoint_id,
      peripheral_id: input.peripheral_id,
      project_id: input.project_id,
      capability_key: input.capability_key,
      capability_class: input.capability_class,
      policy_ref: input.policy_ref,
      granted_by: input.granted_by,
      status: 'active',
      reason_code: input.reason_code,
      evidence_refs: input.evidence_refs,
      granted_at: input.granted_at ?? this.now(),
    });
    await this.store.saveGrant(record);
    return record;
  }

  async revoke(
    input: EndpointCapabilityRevocationInput,
  ): Promise<EndpointCapabilityGrantRecord> {
    const existing = await this.store.getGrant(input.grant_id);
    if (!existing) {
      throw new Error(`Capability grant not found: ${input.grant_id}`);
    }

    const revoked = EndpointCapabilityGrantRecordSchema.parse({
      ...existing,
      status: 'revoked',
      reason_code: input.reason_code,
      evidence_refs: [...new Set([...existing.evidence_refs, ...input.evidence_refs])],
      revoked_at: input.revoked_at ?? this.now(),
    });
    await this.store.saveGrant(revoked);
    return revoked;
  }

  async findActiveGrant(
    endpointId: string,
    capabilityKey: string,
  ): Promise<EndpointCapabilityGrantRecord | null> {
    const grants = await this.store.listGrantsByEndpoint(endpointId);
    return grants.find(
      (grant) =>
        grant.capability_key === capabilityKey &&
        grant.status === 'active',
    ) ?? null;
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }
}
