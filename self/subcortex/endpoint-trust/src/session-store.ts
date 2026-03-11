import { randomUUID } from 'node:crypto';
import type {
  EndpointSessionRecord,
  EndpointSessionRotateInput,
  EndpointSessionStartInput,
  EndpointTransportEnvelope,
} from '@nous/shared';
import { EndpointSessionRecordSchema } from '@nous/shared';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';

export interface SessionStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class SessionStore {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentEndpointTrustStore,
    private readonly options: SessionStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async start(input: EndpointSessionStartInput): Promise<EndpointSessionRecord> {
    const timestamp = input.established_at ?? this.now();
    const record = EndpointSessionRecordSchema.parse({
      session_id: input.session_id ?? this.nextId(),
      endpoint_id: input.endpoint_id,
      peripheral_id: input.peripheral_id,
      project_id: input.project_id,
      status: 'active',
      established_by: input.established_by,
      last_sequence: 0,
      evidence_refs: input.evidence_refs,
      established_at: timestamp,
      expires_at: input.expires_at,
    });
    await this.store.saveSession(record);
    return record;
  }

  async rotate(input: EndpointSessionRotateInput): Promise<EndpointSessionRecord> {
    const existing = await this.store.getSession(input.session_id);
    if (!existing) {
      throw new Error(`Session not found: ${input.session_id}`);
    }

    const rotated = EndpointSessionRecordSchema.parse({
      ...existing,
      status: 'rotated',
      last_nonce: undefined,
      last_sequence: 0,
      rotated_at: input.rotated_at ?? this.now(),
      evidence_refs: [...new Set([...existing.evidence_refs, ...input.evidence_refs])],
    });
    await this.store.saveSession(rotated);
    return rotated;
  }

  async touchAcceptedEnvelope(
    session: EndpointSessionRecord,
    envelope: EndpointTransportEnvelope,
  ): Promise<EndpointSessionRecord> {
    const updated = EndpointSessionRecordSchema.parse({
      ...session,
      last_nonce: envelope.nonce,
      last_sequence: envelope.sequence,
      evidence_refs: [...new Set([...session.evidence_refs, `transport:${envelope.envelope_id}`])],
    });
    await this.store.saveSession(updated);
    return updated;
  }

  async revokeByPeripheral(
    peripheralId: string,
    evidenceRefs: readonly string[],
  ): Promise<EndpointSessionRecord[]> {
    const sessions = await this.store.listSessionsByPeripheral(peripheralId);
    return Promise.all(
      sessions.map((session) =>
        this.store.saveSession({
          ...session,
          status: session.status === 'expired' ? session.status : 'revoked',
          revoked_at: this.now(),
          evidence_refs: [...new Set([...session.evidence_refs, ...evidenceRefs])],
        }),
      ),
    );
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }
}
