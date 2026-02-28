/**
 * Relationship graph store — in-memory implementation.
 *
 * Phase 6.3: Edges between projects with provenance.
 */
import type { ProjectId, RelationshipEdge } from '@nous/shared';
import { RelationshipEdgeSchema } from '@nous/shared';

export interface IRelationshipGraphStore {
  getEdges(projectId: ProjectId): Promise<RelationshipEdge[]>;
  getEdgesBetween(
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): Promise<RelationshipEdge[]>;
  upsertEdges(edges: RelationshipEdge[]): Promise<void>;
  invalidateEdges(
    projectId: ProjectId,
    evidenceRefs?: string[],
  ): Promise<void>;
  listProjectsWithRelationships(): Promise<ProjectId[]>;
}

export class InMemoryRelationshipGraphStore implements IRelationshipGraphStore {
  private readonly edgesBySource = new Map<string, Map<string, RelationshipEdge>>();

  private key(source: string, target: string): string {
    return `${source}::${target}`;
  }

  async getEdges(projectId: ProjectId): Promise<RelationshipEdge[]> {
    const byTarget = this.edgesBySource.get(projectId);
    if (!byTarget) return [];
    return Array.from(byTarget.values()).sort((a, b) =>
      String(a.targetProjectId).localeCompare(String(b.targetProjectId)),
    );
  }

  async getEdgesBetween(
    sourceProjectId: ProjectId,
    targetProjectId: ProjectId,
  ): Promise<RelationshipEdge[]> {
    const byTarget = this.edgesBySource.get(sourceProjectId);
    if (!byTarget) return [];
    const edge = byTarget.get(String(targetProjectId));
    return edge ? [edge] : [];
  }

  async upsertEdges(edges: RelationshipEdge[]): Promise<void> {
    for (const raw of edges) {
      const edge = RelationshipEdgeSchema.parse(raw);
      let byTarget = this.edgesBySource.get(edge.sourceProjectId);
      if (!byTarget) {
        byTarget = new Map();
        this.edgesBySource.set(edge.sourceProjectId, byTarget);
      }
      byTarget.set(String(edge.targetProjectId), edge);
    }
  }

  async invalidateEdges(
    projectId: ProjectId,
    _evidenceRefs?: string[],
  ): Promise<void> {
    this.edgesBySource.delete(projectId);
    for (const byTarget of this.edgesBySource.values()) {
      for (const [target, edge] of byTarget.entries()) {
        if (edge.targetProjectId === projectId) {
          byTarget.delete(target);
        }
      }
    }
  }

  async listProjectsWithRelationships(): Promise<ProjectId[]> {
    const ids = new Set<string>();
    for (const [source, byTarget] of this.edgesBySource) {
      if (byTarget.size > 0) ids.add(source);
      for (const edge of byTarget.values()) {
        ids.add(String(edge.targetProjectId));
      }
    }
    return Array.from(ids) as ProjectId[];
  }
}
