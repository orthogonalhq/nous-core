/**
 * DocumentProjectStore — IProjectStore implementation using IDocumentStore.
 *
 * Projects stored in collection 'projects' with status for archive filtering.
 */
import type {
  IDocumentStore,
  IProjectStore,
  ProjectConfig,
  ProjectId,
} from '@nous/shared';
import { ProjectDocumentSchema } from './schema.js';

const COLLECTION = 'projects';

export class DocumentProjectStore implements IProjectStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async create(config: ProjectConfig): Promise<ProjectId> {
    const now = new Date().toISOString();
    const doc = {
      ...config,
      createdAt: config.createdAt ?? now,
      updatedAt: config.updatedAt ?? now,
      status: 'active' as const,
    };

    const validated = ProjectDocumentSchema.parse(doc);
    await this.documentStore.put(COLLECTION, config.id, validated);

    console.info(`[nous:project] create projectId=${config.id} name=${config.name}`);
    return config.id;
  }

  async get(id: ProjectId): Promise<ProjectConfig | null> {
    const raw = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      id,
    );
    if (!raw) return null;

    const result = ProjectDocumentSchema.safeParse(raw);
    if (!result.success) return null;

    const { status: _status, ...config } = result.data;
    return config as ProjectConfig;
  }

  async list(): Promise<ProjectConfig[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { status: 'active' } },
    );

    const result: ProjectConfig[] = [];
    for (const item of raw) {
      const parsed = ProjectDocumentSchema.safeParse(item);
      if (parsed.success) {
        const { status: _status, ...config } = parsed.data;
        result.push(config as ProjectConfig);
      }
    }
    return result;
  }

  /**
   * List archived projects (mirrors `list()` with the `status: 'archived'`
   * filter). Added in sub-phase 1.3 (WR-163 archived-projects view) — SDS
   * Decision C.
   */
  async listArchived(): Promise<ProjectConfig[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { status: 'archived' } },
    );

    const result: ProjectConfig[] = [];
    for (const item of raw) {
      const parsed = ProjectDocumentSchema.safeParse(item);
      if (parsed.success) {
        const { status: _status, ...config } = parsed.data;
        result.push(config as ProjectConfig);
      }
    }
    return result;
  }

  async update(id: ProjectId, updates: Partial<ProjectConfig>): Promise<void> {
    const existing = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      id,
    );
    if (!existing) {
      throw new Error(`Project ${id} not found`);
    }

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const validated = ProjectDocumentSchema.parse(merged);
    await this.documentStore.put(COLLECTION, id, validated);
  }

  async archive(id: ProjectId): Promise<void> {
    const existing = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      id,
    );
    if (!existing) {
      throw new Error(`Project ${id} not found`);
    }

    const merged = {
      ...existing,
      status: 'archived' as const,
      updatedAt: new Date().toISOString(),
    };
    const validated = ProjectDocumentSchema.parse(merged);
    await this.documentStore.put(COLLECTION, id, validated);

    console.info(`[nous:project] archive projectId=${id}`);
  }

  async unarchive(id: ProjectId): Promise<void> {
    const existing = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      id,
    );
    if (!existing) {
      throw new Error(`Project ${id} not found`);
    }

    const merged = {
      ...existing,
      status: 'active' as const,
      updatedAt: new Date().toISOString(),
    };
    const validated = ProjectDocumentSchema.parse(merged);
    await this.documentStore.put(COLLECTION, id, validated);

    console.info(`[nous:project] unarchive projectId=${id}`);
  }
}
