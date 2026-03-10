import { randomUUID } from 'node:crypto';
import type {
  AcknowledgeInAppEscalationInput,
  EscalationContract,
  EscalationId,
  EscalationResponse,
  IEscalationService,
  IProjectStore,
  InAppEscalationRecord,
  InAppEscalationSurface,
  ProjectConfig,
  ProjectId,
} from '@nous/shared';
import {
  AcknowledgeInAppEscalationInputSchema,
  EscalationResponseSchema,
  InAppEscalationRecordSchema,
} from '@nous/shared';
import { DocumentEscalationStore } from './document-escalation-store.js';

export interface EscalationServiceOptions {
  escalationStore: DocumentEscalationStore;
  projectStore?: IProjectStore;
  now?: () => Date;
}

function uniqueSurfaces(
  values: readonly InAppEscalationSurface[],
): InAppEscalationSurface[] {
  return Array.from(new Set(values));
}

export class EscalationService implements IEscalationService {
  private readonly now: () => Date;

  constructor(private readonly options: EscalationServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private async loadProject(projectId: ProjectId): Promise<ProjectConfig | null> {
    return this.options.projectStore?.get(projectId) ?? null;
  }

  private async resolveRouteTargets(
    contract: EscalationContract,
  ): Promise<InAppEscalationSurface[]> {
    if (contract.channel !== 'in-app') {
      return ['projects'];
    }

    const project = await this.loadProject(contract.projectId);
    const configured =
      project?.escalationPreferences.routeByPriority[contract.priority] ??
      ['projects'];

    if (project?.escalationPreferences.mirrorToChat && !configured.includes('chat')) {
      return uniqueSurfaces([...configured, 'chat']);
    }

    return uniqueSurfaces(configured);
  }

  async notify(contract: EscalationContract): Promise<EscalationId> {
    const timestamp = this.nowIso();
    const escalationId = randomUUID() as EscalationId;
    const routeTargets = await this.resolveRouteTargets(contract);
    const record = InAppEscalationRecordSchema.parse({
      escalationId,
      projectId: contract.projectId,
      source: contract.nodeId ? 'workflow' : 'system',
      severity: contract.priority,
      title: contract.requiredAction,
      message: contract.context,
      status: routeTargets.length > 0 ? 'visible' : 'delivery_degraded',
      routeTargets: routeTargets.length > 0 ? routeTargets : ['projects'],
      requiredAction: contract.requiredAction,
      nodeDefinitionId: contract.nodeId,
      evidenceRefs: [`escalation:${contract.projectId}:${escalationId}`],
      acknowledgements: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.options.escalationStore.save(record);
    return escalationId;
  }

  async checkResponse(escalationId: EscalationId): Promise<EscalationResponse | null> {
    const record = await this.get(escalationId);
    const latestAcknowledgement = record?.acknowledgements.at(-1);
    if (!record || !latestAcknowledgement) {
      return null;
    }

    return EscalationResponseSchema.parse({
      escalationId,
      action:
        record.status === 'resolved' ? 'resolved' : 'acknowledged',
      message: latestAcknowledgement.note,
      respondedAt: latestAcknowledgement.acknowledgedAt,
      channel: 'in-app',
    });
  }

  async get(escalationId: EscalationId): Promise<InAppEscalationRecord | null> {
    return this.options.escalationStore.get(escalationId);
  }

  async listProjectQueue(projectId: ProjectId): Promise<InAppEscalationRecord[]> {
    return this.options.escalationStore.listByProject(projectId);
  }

  async acknowledge(
    input: AcknowledgeInAppEscalationInput,
  ): Promise<InAppEscalationRecord | null> {
    const normalizedInput = AcknowledgeInAppEscalationInputSchema.parse(input);
    const existing = await this.get(normalizedInput.escalationId);
    if (!existing) {
      return null;
    }

    const alreadyAcknowledged = existing.acknowledgements.some(
      (ack) =>
        ack.surface === normalizedInput.surface &&
        ack.actorType === normalizedInput.actorType,
    );
    if (alreadyAcknowledged) {
      return existing;
    }

    const timestamp = this.nowIso();
    const updated = InAppEscalationRecordSchema.parse({
      ...existing,
      status: existing.status === 'resolved' ? 'resolved' : 'acknowledged',
      acknowledgements: [
        ...existing.acknowledgements,
        {
          surface: normalizedInput.surface,
          actorType: normalizedInput.actorType,
          acknowledgedAt: timestamp,
          note: normalizedInput.note,
          evidenceRefs: [
            ...existing.evidenceRefs,
            `escalation-ack:${existing.escalationId}:${normalizedInput.surface}`,
          ],
        },
      ],
      updatedAt: timestamp,
    });

    await this.options.escalationStore.save(updated);
    return updated;
  }
}
