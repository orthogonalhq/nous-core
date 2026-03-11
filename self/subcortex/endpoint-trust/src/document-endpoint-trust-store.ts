import type {
  EndpointCapabilityGrantRecord,
  EndpointIncidentRecord,
  EndpointPairingRecord,
  EndpointSessionRecord,
  EndpointTrustEndpoint,
  EndpointTrustPeripheral,
  IDocumentStore,
} from '@nous/shared';
import {
  EndpointCapabilityGrantRecordSchema,
  EndpointIncidentRecordSchema,
  EndpointPairingRecordSchema,
  EndpointSessionRecordSchema,
  EndpointTrustEndpointSchema,
  EndpointTrustPeripheralSchema,
} from '@nous/shared';

export const ENDPOINT_TRUST_PERIPHERAL_COLLECTION = 'endpoint_trust_peripherals';
export const ENDPOINT_TRUST_PAIRING_COLLECTION = 'endpoint_trust_pairings';
export const ENDPOINT_TRUST_ENDPOINT_COLLECTION = 'endpoint_trust_endpoints';
export const ENDPOINT_TRUST_GRANT_COLLECTION = 'endpoint_trust_grants';
export const ENDPOINT_TRUST_SESSION_COLLECTION = 'endpoint_trust_sessions';
export const ENDPOINT_TRUST_INCIDENT_COLLECTION = 'endpoint_trust_incidents';

function parsePeripheral(value: unknown): EndpointTrustPeripheral | null {
  const parsed = EndpointTrustPeripheralSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parsePairing(value: unknown): EndpointPairingRecord | null {
  const parsed = EndpointPairingRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseEndpoint(value: unknown): EndpointTrustEndpoint | null {
  const parsed = EndpointTrustEndpointSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseGrant(value: unknown): EndpointCapabilityGrantRecord | null {
  const parsed = EndpointCapabilityGrantRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseSession(value: unknown): EndpointSessionRecord | null {
  const parsed = EndpointSessionRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseIncident(value: unknown): EndpointIncidentRecord | null {
  const parsed = EndpointIncidentRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentEndpointTrustStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async savePeripheral(record: EndpointTrustPeripheral): Promise<EndpointTrustPeripheral> {
    const validated = EndpointTrustPeripheralSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_PERIPHERAL_COLLECTION,
      validated.peripheral_id,
      validated,
    );
    return validated;
  }

  async getPeripheral(peripheralId: string): Promise<EndpointTrustPeripheral | null> {
    const raw = await this.documentStore.get<unknown>(
      ENDPOINT_TRUST_PERIPHERAL_COLLECTION,
      peripheralId,
    );
    return parsePeripheral(raw);
  }

  async savePairing(record: EndpointPairingRecord): Promise<EndpointPairingRecord> {
    const validated = EndpointPairingRecordSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_PAIRING_COLLECTION,
      validated.pairing_id,
      validated,
    );
    return validated;
  }

  async getPairing(pairingId: string): Promise<EndpointPairingRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      ENDPOINT_TRUST_PAIRING_COLLECTION,
      pairingId,
    );
    return parsePairing(raw);
  }

  async listPairingsByPeripheral(peripheralId: string): Promise<EndpointPairingRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      ENDPOINT_TRUST_PAIRING_COLLECTION,
      {
        where: { peripheral_id: peripheralId },
        orderBy: 'requested_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parsePairing)
      .filter((record): record is EndpointPairingRecord => record !== null);
  }

  async saveEndpoint(record: EndpointTrustEndpoint): Promise<EndpointTrustEndpoint> {
    const validated = EndpointTrustEndpointSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_ENDPOINT_COLLECTION,
      validated.endpoint_id,
      validated,
    );
    return validated;
  }

  async getEndpoint(endpointId: string): Promise<EndpointTrustEndpoint | null> {
    const raw = await this.documentStore.get<unknown>(
      ENDPOINT_TRUST_ENDPOINT_COLLECTION,
      endpointId,
    );
    return parseEndpoint(raw);
  }

  async listEndpointsByPeripheral(peripheralId: string): Promise<EndpointTrustEndpoint[]> {
    const raw = await this.documentStore.query<unknown>(
      ENDPOINT_TRUST_ENDPOINT_COLLECTION,
      {
        where: { peripheral_id: peripheralId },
        orderBy: 'created_at',
        orderDirection: 'asc',
      },
    );
    return raw
      .map(parseEndpoint)
      .filter((record): record is EndpointTrustEndpoint => record !== null);
  }

  async saveGrant(
    record: EndpointCapabilityGrantRecord,
  ): Promise<EndpointCapabilityGrantRecord> {
    const validated = EndpointCapabilityGrantRecordSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_GRANT_COLLECTION,
      validated.grant_id,
      validated,
    );
    return validated;
  }

  async getGrant(grantId: string): Promise<EndpointCapabilityGrantRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      ENDPOINT_TRUST_GRANT_COLLECTION,
      grantId,
    );
    return parseGrant(raw);
  }

  async listGrantsByEndpoint(endpointId: string): Promise<EndpointCapabilityGrantRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      ENDPOINT_TRUST_GRANT_COLLECTION,
      {
        where: { endpoint_id: endpointId },
        orderBy: 'granted_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parseGrant)
      .filter((record): record is EndpointCapabilityGrantRecord => record !== null);
  }

  async saveSession(record: EndpointSessionRecord): Promise<EndpointSessionRecord> {
    const validated = EndpointSessionRecordSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_SESSION_COLLECTION,
      validated.session_id,
      validated,
    );
    return validated;
  }

  async getSession(sessionId: string): Promise<EndpointSessionRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      ENDPOINT_TRUST_SESSION_COLLECTION,
      sessionId,
    );
    return parseSession(raw);
  }

  async listSessionsByPeripheral(peripheralId: string): Promise<EndpointSessionRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      ENDPOINT_TRUST_SESSION_COLLECTION,
      {
        where: { peripheral_id: peripheralId },
        orderBy: 'established_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parseSession)
      .filter((record): record is EndpointSessionRecord => record !== null);
  }

  async saveIncident(record: EndpointIncidentRecord): Promise<EndpointIncidentRecord> {
    const validated = EndpointIncidentRecordSchema.parse(record);
    await this.documentStore.put(
      ENDPOINT_TRUST_INCIDENT_COLLECTION,
      validated.incident_id,
      validated,
    );
    return validated;
  }

  async listIncidentsByPeripheral(peripheralId: string): Promise<EndpointIncidentRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      ENDPOINT_TRUST_INCIDENT_COLLECTION,
      {
        where: { peripheral_id: peripheralId },
        orderBy: 'reported_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parseIncident)
      .filter((record): record is EndpointIncidentRecord => record !== null);
  }
}
