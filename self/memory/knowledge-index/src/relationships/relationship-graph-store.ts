/**
 * Relationship graph store implementations.
 *
 * Phase 6.3: Edges between projects with provenance.
 */
import type {
  IDocumentStore,
  ProjectId,
  RelationshipEdge,
} from '@nous/shared';
import { RelationshipEdgeSchema } from '@nous/shared';

export const KNOWLEDGE_RELATIONSHIP_COLLECTION = 'knowledge_relationship_edges';

export interface IRelationshipGraphStore {
  getEdges(projectId: ProjectId): Promise<RelationshipEdge[]>;
  getIncomingEdges(projectId: ProjectId): Promise<RelationshipEdge[]>;
  getEdgesBetween(
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): Promise<RelationshipEdge[]>;
  upsertEdges(edges: RelationshipEdge[]): Promise<void>;
  replaceEdgesForSource(
    projectId: ProjectId,
    edges: RelationshipEdge[],
  ): Promise<{ created: number; updated: number; invalidated: number }>;
  invalidateEdges(
    projectId: ProjectId,
    evidenceRefs?: string[],
  ): Promise<number>;
  listProjectsWithRelationships(): Promise<ProjectId[]>;
}

export class InMemoryRelationshipGraphStore implements IRelationshipGraphStore {
  private readonly edgesBySource = new Map<string, Map<string, RelationshipEdge>>();

  async getEdges(projectId: ProjectId): Promise<RelationshipEdge[]> {
    return sortEdges(Array.from(this.edgesBySource.get(projectId)?.values() ?? []));
  }

  async getIncomingEdges(projectId: ProjectId): Promise<RelationshipEdge[]> {
    const incoming: RelationshipEdge[] = [];
    for (const byEdgeId of this.edgesBySource.values()) {
      for (const edge of byEdgeId.values()) {
        if (edge.targetProjectId === projectId) {
          incoming.push(edge);
        }
      }
    }
    return sortEdges(incoming);
  }

  async getEdgesBetween(
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): Promise<RelationshipEdge[]> {
    return (await this.getEdges(sourceProjectId)).filter(
      (edge) => edge.targetProjectId === targetProjectId,
    );
  }

  async upsertEdges(edges: RelationshipEdge[]): Promise<void> {
    for (const raw of edges) {
      const edge = RelationshipEdgeSchema.parse(raw);
      let byEdgeId = this.edgesBySource.get(edge.sourceProjectId);
      if (!byEdgeId) {
        byEdgeId = new Map();
        this.edgesBySource.set(edge.sourceProjectId, byEdgeId);
      }
      byEdgeId.set(edge.id, edge);
    }
  }

  async replaceEdgesForSource(
    projectId: ProjectId,
    edges: RelationshipEdge[],
  ): Promise<{ created: number; updated: number; invalidated: number }> {
    const existing = this.edgesBySource.get(projectId) ?? new Map();
    const next = new Map<string, RelationshipEdge>();
    let created = 0;
    let updated = 0;

    for (const raw of edges) {
      const edge = RelationshipEdgeSchema.parse(raw);
      const previous = existing.get(edge.id);
      if (!previous) {
        created += 1;
      } else if (JSON.stringify(previous) !== JSON.stringify(edge)) {
        updated += 1;
      }
      next.set(edge.id, edge);
    }

    const invalidated = Array.from(existing.keys()).filter((id) => !next.has(id)).length;
    this.edgesBySource.set(projectId, next);
    return { created, updated, invalidated };
  }

  async invalidateEdges(
    projectId: ProjectId,
    _evidenceRefs?: string[],
  ): Promise<number> {
    let invalidated = this.edgesBySource.get(projectId)?.size ?? 0;
    this.edgesBySource.delete(projectId);
    for (const byEdgeId of this.edgesBySource.values()) {
      for (const [edgeId, edge] of byEdgeId.entries()) {
        if (edge.targetProjectId === projectId) {
          byEdgeId.delete(edgeId);
          invalidated += 1;
        }
      }
    }
    return invalidated;
  }

  async listProjectsWithRelationships(): Promise<ProjectId[]> {
    const ids = new Set<string>();
    for (const [source, byEdgeId] of this.edgesBySource) {
      if (byEdgeId.size > 0) {
        ids.add(source);
      }
      for (const edge of byEdgeId.values()) {
        ids.add(String(edge.targetProjectId));
      }
    }
    return Array.from(ids).sort() as ProjectId[];
  }
}

function parseRelationshipEdge(value: unknown): RelationshipEdge | null {
  const parsed = RelationshipEdgeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentRelationshipGraphStore implements IRelationshipGraphStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async getEdges(projectId: ProjectId): Promise<RelationshipEdge[]> {
    const raw = await this.documentStore.query<unknown>(KNOWLEDGE_RELATIONSHIP_COLLECTION, {
      where: { sourceProjectId: projectId },
    });
    return sortEdges(
      raw
        .map(parseRelationshipEdge)
        .filter((edge): edge is RelationshipEdge => edge !== null),
    );
  }

  async getIncomingEdges(projectId: ProjectId): Promise<RelationshipEdge[]> {
    const raw = await this.documentStore.query<unknown>(KNOWLEDGE_RELATIONSHIP_COLLECTION, {
      where: { targetProjectId: projectId },
    });
    return sortEdges(
      raw
        .map(parseRelationshipEdge)
        .filter((edge): edge is RelationshipEdge => edge !== null),
    );
  }

  async getEdgesBetween(
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): Promise<RelationshipEdge[]> {
    return (await this.getEdges(sourceProjectId)).filter(
      (edge) => edge.targetProjectId === targetProjectId,
    );
  }

  async upsertEdges(edges: RelationshipEdge[]): Promise<void> {
    for (const raw of edges) {
      const edge = RelationshipEdgeSchema.parse(raw);
      await this.documentStore.put(
        KNOWLEDGE_RELATIONSHIP_COLLECTION,
        edge.id,
        edge,
      );
    }
  }

  async replaceEdgesForSource(
    projectId: ProjectId,
    edges: RelationshipEdge[],
  ): Promise<{ created: number; updated: number; invalidated: number }> {
    const existing = await this.getEdges(projectId);
    const existingById = new Map(existing.map((edge) => [edge.id, edge]));
    const nextIds = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const raw of edges) {
      const edge = RelationshipEdgeSchema.parse(raw);
      const previous = existingById.get(edge.id);
      if (!previous) {
        created += 1;
      } else if (JSON.stringify(previous) !== JSON.stringify(edge)) {
        updated += 1;
      }
      nextIds.add(edge.id);
      await this.documentStore.put(KNOWLEDGE_RELATIONSHIP_COLLECTION, edge.id, edge);
    }

    let invalidated = 0;
    for (const edge of existing) {
      if (nextIds.has(edge.id)) {
        continue;
      }
      const deleted = await this.documentStore.delete(
        KNOWLEDGE_RELATIONSHIP_COLLECTION,
        edge.id,
      );
      if (deleted) {
        invalidated += 1;
      }
    }

    return { created, updated, invalidated };
  }

  async invalidateEdges(
    projectId: ProjectId,
    _evidenceRefs?: string[],
  ): Promise<number> {
    const outgoing = await this.getEdges(projectId);
    const incoming = await this.getIncomingEdges(projectId);
    let invalidated = 0;

    for (const edge of [...outgoing, ...incoming]) {
      const deleted = await this.documentStore.delete(
        KNOWLEDGE_RELATIONSHIP_COLLECTION,
        edge.id,
      );
      if (deleted) {
        invalidated += 1;
      }
    }

    return invalidated;
  }

  async listProjectsWithRelationships(): Promise<ProjectId[]> {
    const raw = await this.documentStore.query<unknown>(KNOWLEDGE_RELATIONSHIP_COLLECTION, {});
    const ids = new Set<string>();
    for (const edge of raw
      .map(parseRelationshipEdge)
      .filter((value): value is RelationshipEdge => value !== null)) {
      ids.add(edge.sourceProjectId);
      ids.add(edge.targetProjectId);
    }
    return Array.from(ids).sort() as ProjectId[];
  }
}

function sortEdges(edges: RelationshipEdge[]): RelationshipEdge[] {
  return [...edges].sort((left, right) => {
    if (left.targetProjectId !== right.targetProjectId) {
      return left.targetProjectId.localeCompare(right.targetProjectId);
    }
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }
    return left.id.localeCompare(right.id);
  });
}
