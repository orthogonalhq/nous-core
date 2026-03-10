import type { EscalationId, IDocumentStore, InAppEscalationRecord, ProjectId } from '@nous/shared';
import { InAppEscalationRecordSchema } from '@nous/shared';

export const ESCALATION_COLLECTION = 'in_app_escalations';

function parseEscalation(value: unknown): InAppEscalationRecord | null {
  const parsed = InAppEscalationRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentEscalationStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async save(record: InAppEscalationRecord): Promise<InAppEscalationRecord> {
    const validated = InAppEscalationRecordSchema.parse(record);
    await this.documentStore.put(
      ESCALATION_COLLECTION,
      validated.escalationId,
      validated,
    );
    return validated;
  }

  async get(escalationId: EscalationId): Promise<InAppEscalationRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      ESCALATION_COLLECTION,
      escalationId,
    );
    return parseEscalation(raw);
  }

  async listByProject(projectId: ProjectId): Promise<InAppEscalationRecord[]> {
    const raw = await this.documentStore.query<unknown>(ESCALATION_COLLECTION, {
      where: { projectId },
      orderBy: 'updatedAt',
      orderDirection: 'desc',
    });

    return raw
      .map(parseEscalation)
      .filter((record): record is InAppEscalationRecord => record !== null);
  }
}
