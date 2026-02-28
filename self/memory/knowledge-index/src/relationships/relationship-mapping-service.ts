/**
 * Relationship mapping service — evaluates patterns and stores edges.
 *
 * Phase 6.3: Invoked when patterns are distilled. Extractor produces edges;
 * service stores with provenance.
 */
import type {
  Phase6DistilledPatternExport,
  ProjectId,
  RelationshipMappingOutput,
  TraceEvidenceReference,
} from '@nous/shared';
import { RelationshipMappingOutputSchema } from '@nous/shared';
import type { IRelationshipGraphStore } from './relationship-graph-store.js';
import type { IRelationshipExtractor } from './relationship-extractor.js';

export interface RelationshipMappingServiceDeps {
  graphStore: IRelationshipGraphStore;
  extractor: IRelationshipExtractor;
}

export class RelationshipMappingService {
  constructor(private readonly deps: RelationshipMappingServiceDeps) {}

  async evaluateFromPatterns(
    projectId: ProjectId,
    patterns: Phase6DistilledPatternExport[],
  ): Promise<RelationshipMappingOutput> {
    if (patterns.length === 0) {
      return RelationshipMappingOutputSchema.parse({
        projectId,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs: [],
      });
    }

    const edges = await this.deps.extractor.extract(projectId, patterns);
    const evidenceRefs: TraceEvidenceReference[] = patterns.flatMap((p) =>
      p.evidenceRefs.length > 0 ? p.evidenceRefs : [],
    );

    const existing = await this.deps.graphStore.getEdges(projectId);
    const existingCount = existing.length;

    if (edges.length > 0) {
      await this.deps.graphStore.invalidateEdges(projectId);
      await this.deps.graphStore.upsertEdges(edges);
    }

    const created = edges.length;
    const updated = 0;
    const invalidated = existingCount;

    return RelationshipMappingOutputSchema.parse({
      projectId,
      edgesCreated: created,
      edgesUpdated: updated,
      edgesInvalidated: invalidated,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : [],
    });
  }
}
