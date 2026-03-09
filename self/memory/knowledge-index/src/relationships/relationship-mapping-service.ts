/**
 * Relationship mapping service — evaluates patterns and stores edges.
 *
 * Phase 6.3: Invoked when patterns are distilled. Extractor produces edges;
 * service stores with provenance.
 */
import { createHash } from 'node:crypto';
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

    const extracted = await this.deps.extractor.extract(projectId, patterns);
    const edges = dedupeEdges(
      extracted.map((edge) => ({
        ...edge,
        id: buildDeterministicRelationshipEdgeId(
          edge.sourceProjectId,
          edge.targetProjectId,
          edge.type,
        ),
      })),
    );
    const evidenceRefs: TraceEvidenceReference[] = patterns.flatMap((pattern) =>
      pattern.evidenceRefs.length > 0 ? pattern.evidenceRefs : [],
    );
    const counts = await this.deps.graphStore.replaceEdgesForSource(projectId, edges);

    return RelationshipMappingOutputSchema.parse({
      projectId,
      edgesCreated: counts.created,
      edgesUpdated: counts.updated,
      edgesInvalidated: counts.invalidated,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : [],
    });
  }
}

export function buildDeterministicRelationshipEdgeId(
  sourceProjectId: ProjectId,
  targetProjectId: ProjectId,
  type: string,
): string {
  const hash = createHash('sha256')
    .update(`${sourceProjectId}:${targetProjectId}:${type}`)
    .digest('hex');
  const variant = (parseInt(hash.slice(16, 18), 16) & 0x3f | 0x80)
    .toString(16)
    .padStart(2, '0');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function dedupeEdges<T extends { id: string }>(edges: T[]): T[] {
  const byId = new Map<string, T>();
  for (const edge of edges) {
    byId.set(edge.id, edge);
  }
  return Array.from(byId.values());
}
