/**
 * DocumentTaskStore — ITaskStore implementation using IDocumentStore.
 *
 * Tasks stored in collection 'tasks' with (collection, id) composite key.
 * Each task document includes a projectId for project-scoped queries.
 *
 * WR-111 — Lightweight Task System.
 */
import type { IDocumentStore, ITaskStore, ProjectId, TaskDefinition } from '@nous/shared';
import { TaskDefinitionSchema } from '@nous/shared';

const COLLECTION = 'tasks';

function parseTask(value: unknown): TaskDefinition | null {
  const parsed = TaskDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentTaskStore implements ITaskStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async save(projectId: ProjectId, task: TaskDefinition): Promise<TaskDefinition> {
    const validated = TaskDefinitionSchema.parse(task);
    // Store projectId alongside the task for project-scoped queries
    await this.documentStore.put(COLLECTION, validated.id, {
      ...validated,
      projectId,
    });
    return validated;
  }

  async get(projectId: ProjectId, taskId: string): Promise<TaskDefinition | null> {
    const raw = await this.documentStore.get<Record<string, unknown>>(COLLECTION, taskId);
    if (!raw || raw.projectId !== projectId) return null;
    return parseTask(raw);
  }

  async listByProject(projectId: ProjectId): Promise<TaskDefinition[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(COLLECTION, {
      where: { projectId },
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });

    return raw
      .map(parseTask)
      .filter((task): task is TaskDefinition => task !== null);
  }

  async delete(projectId: ProjectId, taskId: string): Promise<boolean> {
    // Verify ownership before deleting
    const existing = await this.get(projectId, taskId);
    if (!existing) return false;
    return this.documentStore.delete(COLLECTION, taskId);
  }
}
