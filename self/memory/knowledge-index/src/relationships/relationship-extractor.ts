/**
 * Relationship extractor — interface and stub implementation.
 *
 * Phase 6.3: Extracts relationship edges from distilled patterns.
 * Stub returns empty; real LLM-backed extractor is caller responsibility.
 */
import type {
  Phase6DistilledPatternExport,
  ProjectId,
  RelationshipEdge,
} from '@nous/shared';

export interface IRelationshipExtractor {
  extract(
    projectId: ProjectId,
    patterns: Phase6DistilledPatternExport[],
  ): Promise<RelationshipEdge[]>;
}

/**
 * Stub extractor — returns empty edges.
 * Use for tests and when LLM integration is not yet wired.
 */
export class StubRelationshipExtractor implements IRelationshipExtractor {
  async extract(
    _projectId: ProjectId,
    _patterns: Phase6DistilledPatternExport[],
  ): Promise<RelationshipEdge[]> {
    return [];
  }
}
