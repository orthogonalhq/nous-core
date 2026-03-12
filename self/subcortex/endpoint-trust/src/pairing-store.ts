import { randomUUID } from 'node:crypto';
import type {
  EndpointPairingRecord,
  EndpointPairingRequestInput,
  EndpointPairingReviewInput,
  EndpointTrustPeripheral,
} from '@nous/shared';
import {
  EndpointPairingRecordSchema,
  EndpointTrustPeripheralSchema,
} from '@nous/shared';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';

export interface PairingStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class PairingStore {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentEndpointTrustStore,
    private readonly options: PairingStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createPairing(input: EndpointPairingRequestInput): Promise<{
    peripheral: EndpointTrustPeripheral;
    pairing: EndpointPairingRecord;
  }> {
    const timestamp = input.requested_at ?? this.now();
    const existingPeripheral = await this.store.getPeripheral(input.peripheral_id);
    const peripheral = EndpointTrustPeripheralSchema.parse({
      peripheral_id: input.peripheral_id,
      project_id: input.project_id,
      display_name: input.display_name,
      principal_id: input.principal_id,
      trust_state: 'pending',
      connector_package_id: input.connector_package_id ?? existingPeripheral?.connector_package_id,
      connector_release_id: input.connector_release_id ?? existingPeripheral?.connector_release_id,
      paired_at: existingPeripheral?.paired_at,
      last_seen_at: timestamp,
      metadata: { ...existingPeripheral?.metadata, ...input.metadata },
      evidence_refs: [
        ...new Set([...(existingPeripheral?.evidence_refs ?? []), ...input.evidence_refs]),
      ],
      created_at: existingPeripheral?.created_at ?? timestamp,
      updated_at: timestamp,
    });
    const pairing = EndpointPairingRecordSchema.parse({
      pairing_id: input.pairing_id ?? this.nextId(),
      peripheral_id: input.peripheral_id,
      project_id: input.project_id,
      principal_id: input.principal_id,
      status: 'pending',
      evidence_refs: input.evidence_refs,
      requested_at: timestamp,
      metadata: input.metadata,
    });

    await this.store.savePeripheral(peripheral);
    await this.store.savePairing(pairing);

    return { peripheral, pairing };
  }

  async reviewPairing(input: EndpointPairingReviewInput): Promise<{
    peripheral: EndpointTrustPeripheral;
    pairing: EndpointPairingRecord;
  }> {
    const existingPairing = await this.store.getPairing(input.pairing_id);
    if (!existingPairing) {
      throw new Error(`Pairing not found: ${input.pairing_id}`);
    }

    const existingPeripheral = await this.store.getPeripheral(existingPairing.peripheral_id);
    if (!existingPeripheral) {
      throw new Error(`Peripheral not found: ${existingPairing.peripheral_id}`);
    }

    const timestamp = input.reviewed_at ?? this.now();
    const pairing = EndpointPairingRecordSchema.parse({
      ...existingPairing,
      status: input.approved ? 'approved' : 'denied',
      approval_evidence_ref: input.approved
        ? input.approval_evidence_ref
        : existingPairing.approval_evidence_ref,
      denial_reason_code: input.approved ? undefined : input.denial_reason_code,
      evidence_refs: [...new Set([...existingPairing.evidence_refs, ...input.evidence_refs])],
      reviewed_at: timestamp,
      metadata: {
        ...existingPairing.metadata,
        reviewed_by: input.reviewed_by,
      },
    });
    const peripheral = EndpointTrustPeripheralSchema.parse({
      ...existingPeripheral,
      trust_state: input.approved ? 'trusted' : 'denied',
      paired_at: input.approved ? timestamp : existingPeripheral.paired_at,
      updated_at: timestamp,
      evidence_refs: [...new Set([...existingPeripheral.evidence_refs, ...input.evidence_refs])],
    });

    await this.store.savePairing(pairing);
    await this.store.savePeripheral(peripheral);

    return { peripheral, pairing };
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }
}
