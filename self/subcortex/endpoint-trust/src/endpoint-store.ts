import { randomUUID } from 'node:crypto';
import type {
  EndpointRegistrationInput,
  EndpointTrustEndpoint,
  EndpointTrustPeripheral,
  RegistryInstallEligibilitySnapshot,
} from '@nous/shared';
import { EndpointTrustEndpointSchema } from '@nous/shared';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';

export interface EndpointStoreOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class EndpointStore {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentEndpointTrustStore,
    private readonly options: EndpointStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async register(
    input: EndpointRegistrationInput,
    peripheral: EndpointTrustPeripheral,
    registryEligibility?: RegistryInstallEligibilitySnapshot,
  ): Promise<EndpointTrustEndpoint> {
    const timestamp = input.registered_at ?? this.now();
    const allowed = registryEligibility == null || (
      registryEligibility.distribution_status === 'active' &&
      registryEligibility.block_reason_codes.length === 0 &&
      !registryEligibility.requires_principal_override
    );
    const record = EndpointTrustEndpointSchema.parse({
      endpoint_id: input.endpoint_id ?? this.nextId(),
      peripheral_id: input.peripheral_id,
      project_id: input.project_id,
      display_name: input.display_name,
      direction: input.direction,
      capability_keys: input.capability_keys,
      trust_state: peripheral.trust_state === 'trusted' && allowed ? 'trusted' : 'suspended',
      connector_package_id: input.connector_package_id ?? peripheral.connector_package_id,
      connector_release_id: input.connector_release_id ?? peripheral.connector_release_id,
      registry_eligibility: registryEligibility,
      metadata: input.metadata,
      evidence_refs: input.evidence_refs,
      created_at: timestamp,
      updated_at: timestamp,
    });

    await this.store.saveEndpoint(record);
    return record;
  }

  async setTrustStateForPeripheral(
    peripheralId: string,
    trustState: EndpointTrustEndpoint['trust_state'],
    evidenceRefs: readonly string[],
  ): Promise<EndpointTrustEndpoint[]> {
    const endpoints = await this.store.listEndpointsByPeripheral(peripheralId);
    return Promise.all(
      endpoints.map((endpoint) =>
        this.store.saveEndpoint({
          ...endpoint,
          trust_state: trustState,
          updated_at: this.now(),
          evidence_refs: [...new Set([...endpoint.evidence_refs, ...evidenceRefs])],
        }),
      ),
    );
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }
}
