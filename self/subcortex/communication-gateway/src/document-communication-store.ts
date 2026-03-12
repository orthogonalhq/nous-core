import type {
  CommunicationApprovalIntakeRecord,
  CommunicationChannel,
  CommunicationDeliveryAttempt,
  CommunicationIdentityBindingRecord,
  CommunicationRouteDecision,
  IDocumentStore,
} from '@nous/shared';
import {
  CommunicationApprovalIntakeRecordSchema,
  CommunicationDeliveryAttemptSchema,
  CommunicationIdentityBindingRecordSchema,
  CommunicationRouteDecisionSchema,
} from '@nous/shared';

export const COMMUNICATION_BINDING_COLLECTION = 'communication_bindings';
export const COMMUNICATION_APPROVAL_INTAKE_COLLECTION =
  'communication_approval_intake';
export const COMMUNICATION_ROUTE_COLLECTION = 'communication_routes';
export const COMMUNICATION_DELIVERY_COLLECTION = 'communication_deliveries';

function parseBinding(value: unknown): CommunicationIdentityBindingRecord | null {
  const parsed = CommunicationIdentityBindingRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseIntake(value: unknown): CommunicationApprovalIntakeRecord | null {
  const parsed = CommunicationApprovalIntakeRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseRoute(value: unknown): CommunicationRouteDecision | null {
  const parsed = CommunicationRouteDecisionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseDelivery(value: unknown): CommunicationDeliveryAttempt | null {
  const parsed = CommunicationDeliveryAttemptSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentCommunicationStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async saveBinding(
    record: CommunicationIdentityBindingRecord,
  ): Promise<CommunicationIdentityBindingRecord> {
    const validated = CommunicationIdentityBindingRecordSchema.parse(record);
    await this.documentStore.put(
      COMMUNICATION_BINDING_COLLECTION,
      validated.binding_id,
      validated,
    );
    return validated;
  }

  async getBinding(bindingId: string): Promise<CommunicationIdentityBindingRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      COMMUNICATION_BINDING_COLLECTION,
      bindingId,
    );
    return parseBinding(raw);
  }

  async findBindingByIdentity(input: {
    channel: CommunicationChannel;
    account_id: string;
    channel_identity: string;
  }): Promise<CommunicationIdentityBindingRecord | null> {
    const raw = await this.documentStore.query<unknown>(
      COMMUNICATION_BINDING_COLLECTION,
      {
        where: input,
        orderBy: 'updated_at',
        orderDirection: 'desc',
        limit: 1,
      },
    );
    return parseBinding(raw[0] ?? null);
  }

  async listBindingsByFailoverGroup(
    failoverGroupRef: string,
  ): Promise<CommunicationIdentityBindingRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      COMMUNICATION_BINDING_COLLECTION,
      {
        where: { failover_group_ref: failoverGroupRef },
        orderBy: 'updated_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parseBinding)
      .filter((record): record is CommunicationIdentityBindingRecord => record !== null);
  }

  async saveApprovalIntake(
    record: CommunicationApprovalIntakeRecord,
  ): Promise<CommunicationApprovalIntakeRecord> {
    const validated = CommunicationApprovalIntakeRecordSchema.parse(record);
    await this.documentStore.put(
      COMMUNICATION_APPROVAL_INTAKE_COLLECTION,
      validated.intake_id,
      validated,
    );
    return validated;
  }

  async findApprovalIntake(input: {
    channel: CommunicationChannel;
    account_id: string;
    conversation_id: string;
    channel_identity: string;
  }): Promise<CommunicationApprovalIntakeRecord | null> {
    const raw = await this.documentStore.query<unknown>(
      COMMUNICATION_APPROVAL_INTAKE_COLLECTION,
      {
        where: input,
        orderBy: 'last_seen_at',
        orderDirection: 'desc',
        limit: 1,
      },
    );
    return parseIntake(raw[0] ?? null);
  }

  async listApprovalIntake(): Promise<CommunicationApprovalIntakeRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      COMMUNICATION_APPROVAL_INTAKE_COLLECTION,
      {
        orderBy: 'last_seen_at',
        orderDirection: 'desc',
      },
    );
    return raw
      .map(parseIntake)
      .filter((record): record is CommunicationApprovalIntakeRecord => record !== null);
  }

  async saveRouteDecision(
    record: CommunicationRouteDecision,
  ): Promise<CommunicationRouteDecision> {
    const validated = CommunicationRouteDecisionSchema.parse(record);
    await this.documentStore.put(
      COMMUNICATION_ROUTE_COLLECTION,
      validated.route_id,
      validated,
    );
    return validated;
  }

  async getRouteDecision(routeId: string): Promise<CommunicationRouteDecision | null> {
    const raw = await this.documentStore.get<unknown>(
      COMMUNICATION_ROUTE_COLLECTION,
      routeId,
    );
    return parseRoute(raw);
  }

  async saveDeliveryAttempt(
    record: CommunicationDeliveryAttempt,
  ): Promise<CommunicationDeliveryAttempt> {
    const validated = CommunicationDeliveryAttemptSchema.parse(record);
    await this.documentStore.put(
      COMMUNICATION_DELIVERY_COLLECTION,
      validated.delivery_attempt_id,
      validated,
    );
    return validated;
  }

  async getLatestDeliveryAttemptByEgressId(
    egressId: string,
  ): Promise<CommunicationDeliveryAttempt | null> {
    const raw = await this.documentStore.query<unknown>(
      COMMUNICATION_DELIVERY_COLLECTION,
      {
        where: { egress_id: egressId },
        orderBy: 'occurred_at',
        orderDirection: 'desc',
        limit: 1,
      },
    );
    return parseDelivery(raw[0] ?? null);
  }
}
