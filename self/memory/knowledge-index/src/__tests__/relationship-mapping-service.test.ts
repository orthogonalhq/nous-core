/**
 * Phase 6.3 — RelationshipMappingService behavior tests.
 */
import { describe, it, expect } from 'vitest';
import { RelationshipMappingService } from '../relationships/relationship-mapping-service.js';
import { InMemoryRelationshipGraphStore } from '../relationships/relationship-graph-store.js';
import { StubRelationshipExtractor } from '../relationships/relationship-extractor.js';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  type Phase6DistilledPatternExport,
} from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');
const MID = MemoryEntryIdSchema.parse('660e8400-e29b-41d4-a716-446655440000');

function makePattern(overrides?: Partial<Phase6DistilledPatternExport>): Phase6DistilledPatternExport {
  const now = new Date().toISOString();
  return {
    id: MID,
    content: 'pattern content',
    confidence: 0.9,
    basedOn: [],
    supersedes: [],
    evidenceRefs: [{ actionCategory: 'memory-write' }],
    scope: 'project',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('RelationshipMappingService', () => {
  it('evaluateFromPatterns with stub extractor returns empty edges', async () => {
    const graphStore = new InMemoryRelationshipGraphStore();
    const extractor = new StubRelationshipExtractor();
    const service = new RelationshipMappingService({ graphStore, extractor });

    const output = await service.evaluateFromPatterns(P1, [
      makePattern(),
      makePattern({ id: MemoryEntryIdSchema.parse('660e8400-e29b-41d4-a716-446655440001') }),
    ]);

    expect(output.projectId).toBe(P1);
    expect(output.edgesCreated).toBe(0);
    expect(output.edgesUpdated).toBe(0);
    expect(output.edgesInvalidated).toBe(0);
  });

  it('evaluateFromPatterns with empty patterns returns zero counts', async () => {
    const graphStore = new InMemoryRelationshipGraphStore();
    const extractor = new StubRelationshipExtractor();
    const service = new RelationshipMappingService({ graphStore, extractor });

    const output = await service.evaluateFromPatterns(P1, []);

    expect(output.projectId).toBe(P1);
    expect(output.edgesCreated).toBe(0);
    expect(output.edgesUpdated).toBe(0);
    expect(output.edgesInvalidated).toBe(0);
  });

  it('evaluateFromPatterns with mock extractor stores edges', async () => {
    const graphStore = new InMemoryRelationshipGraphStore();
    const mockExtractor = {
      extract: async () => {
        const now = new Date().toISOString();
        return [
          {
            id: crypto.randomUUID(),
            sourceProjectId: P1,
            targetProjectId: P2,
            strength: 0.8,
            type: 'thematic' as const,
            evidenceRefs: [{ actionCategory: 'memory-write' as const }],
            sourcePatternIds: [MID],
            createdAt: now,
            updatedAt: now,
          },
        ];
      },
    };
    const service = new RelationshipMappingService({
      graphStore,
      extractor: mockExtractor,
    });

    const output = await service.evaluateFromPatterns(P1, [makePattern()]);

    expect(output.edgesCreated).toBe(1);
    const edges = await graphStore.getEdges(P1);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.targetProjectId).toBe(P2);
  });

  it('counts updates and invalidations using deterministic semantic ids', async () => {
    const graphStore = new InMemoryRelationshipGraphStore();
    let strength = 0.6;
    const extractor = {
      extract: async () => {
        const now = new Date().toISOString();
        return [
          {
            id: crypto.randomUUID(),
            sourceProjectId: P1,
            targetProjectId: P2,
            strength,
            type: 'thematic' as const,
            evidenceRefs: [{ actionCategory: 'memory-write' as const }],
            sourcePatternIds: [MID],
            createdAt: now,
            updatedAt: now,
          },
        ];
      },
    };
    const service = new RelationshipMappingService({ graphStore, extractor });

    await service.evaluateFromPatterns(P1, [makePattern()]);
    strength = 0.9;
    const updated = await service.evaluateFromPatterns(P1, [
      makePattern({ content: 'changed pattern content' }),
    ]);
    const cleared = await graphStore.replaceEdgesForSource(P1, []);

    expect(updated.edgesUpdated).toBe(1);
    expect(cleared.invalidated).toBe(1);
  });
});
