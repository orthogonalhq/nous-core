import type { IDocumentStore, ProjectId, ScheduleDefinition } from '@nous/shared';
import { ScheduleDefinitionSchema } from '@nous/shared';

export const SCHEDULE_COLLECTION = 'workflow_schedules';

function parseSchedule(value: unknown): ScheduleDefinition | null {
  const parsed = ScheduleDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentScheduleStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async save(schedule: ScheduleDefinition): Promise<ScheduleDefinition> {
    const validated = ScheduleDefinitionSchema.parse(schedule);
    await this.documentStore.put(SCHEDULE_COLLECTION, validated.id, validated);
    return validated;
  }

  async get(scheduleId: string): Promise<ScheduleDefinition | null> {
    const raw = await this.documentStore.get<unknown>(SCHEDULE_COLLECTION, scheduleId);
    return parseSchedule(raw);
  }

  async listAll(): Promise<ScheduleDefinition[]> {
    const raw = await this.documentStore.query<unknown>(SCHEDULE_COLLECTION, {
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });

    return raw
      .map(parseSchedule)
      .filter((schedule): schedule is ScheduleDefinition => schedule !== null);
  }

  async listByProject(projectId: ProjectId): Promise<ScheduleDefinition[]> {
    const raw = await this.documentStore.query<unknown>(SCHEDULE_COLLECTION, {
      where: { projectId },
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });

    return raw
      .map(parseSchedule)
      .filter((schedule): schedule is ScheduleDefinition => schedule !== null);
  }

  async listDue(referenceTime: string): Promise<ScheduleDefinition[]> {
    const dueAt = Date.parse(referenceTime);
    if (Number.isNaN(dueAt)) {
      throw new Error(`Invalid reference time: ${referenceTime}`);
    }

    const schedules = await this.listAll();
    return schedules
      .filter(
        (schedule) =>
          schedule.enabled &&
          (schedule.trigger.kind === 'cron' || schedule.trigger.kind === 'calendar') &&
          schedule.nextDueAt != null &&
          Date.parse(schedule.nextDueAt) <= dueAt,
      )
      .sort((left, right) => {
        const leftDue = left.nextDueAt ?? '';
        const rightDue = right.nextDueAt ?? '';
        return leftDue.localeCompare(rightDue);
      });
  }

  async cancel(scheduleId: string, updatedAt: string): Promise<boolean> {
    const existing = await this.get(scheduleId);
    if (!existing) {
      return false;
    }

    await this.save({
      ...existing,
      enabled: false,
      nextDueAt: null,
      updatedAt,
    });
    return true;
  }
}
