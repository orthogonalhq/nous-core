/**
 * tRPC discovery router contract test.
 *
 * Validates Zod schema shapes for the discovery router procedures using
 * .safeParse() only -- no createCaller, no network, no runtime dependencies.
 * Tests input validation, boundary values, and output schema parsing.
 */
import { describe, expect, it } from 'vitest';
import {
  ProjectDiscoveryRequestSchema,
  ProjectDiscoveryResultSchema,
  ProjectKnowledgeSnapshotSchema,
  ProjectKnowledgeRefreshRecordSchema,
} from '@nous/shared';
import { ProjectIdSchema } from '@nous/shared';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

describe('ProjectDiscoveryRequestSchema', () => {
  it('accepts valid input with all required fields', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test query',
      topK: 5,
      includeMetaVector: true,
      includeTaxonomy: true,
      includeRelationships: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts input with defaults applied (topK, includes)', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test query',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topK).toBe(10);
      expect(result.data.includeMetaVector).toBe(true);
      expect(result.data.includeTaxonomy).toBe(true);
      expect(result.data.includeRelationships).toBe(true);
    }
  });

  it('accepts topK at minimum boundary (1)', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test',
      topK: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts topK at maximum boundary (25)', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test',
      topK: 25,
    });
    expect(result.success).toBe(true);
  });

  it('accepts input with optional traceId omitted', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test query',
      topK: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing requestingProjectId', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      query: 'test query',
      topK: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty query string', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: '',
      topK: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only query string', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: '   ',
      topK: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects topK below minimum (0)', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test',
      topK: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects topK above maximum (26)', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: VALID_UUID,
      query: 'test',
      topK: 26,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID requestingProjectId', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: 'not-a-uuid',
      query: 'test',
      topK: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectDiscoveryResultSchema', () => {
  it('accepts a representative output object', () => {
    const result = ProjectDiscoveryResultSchema.safeParse({
      discovery: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        requestingProjectId: VALID_UUID,
        projectIds: [VALID_UUID],
        results: [{ projectId: VALID_UUID, rank: 1, combinedScore: 0.9 }],
        audit: {
          projectIdsDiscovered: [VALID_UUID],
          metaVectorCount: 1,
          taxonomyCount: 0,
          relationshipCount: 0,
          mergeStrategy: 'meta-vector-primary',
        },
      },
      policy: {
        deniedProjectCount: 0,
        reasonCodes: [],
      },
      snapshot: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects output missing discovery field', () => {
    const result = ProjectDiscoveryResultSchema.safeParse({
      policy: { deniedProjectCount: 0, reasonCodes: [] },
      snapshot: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects output missing policy field', () => {
    const result = ProjectDiscoveryResultSchema.safeParse({
      discovery: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        requestingProjectId: VALID_UUID,
        projectIds: [],
        results: [],
        audit: {
          projectIdsDiscovered: [],
          metaVectorCount: 0,
          taxonomyCount: 0,
          relationshipCount: 0,
          mergeStrategy: 'meta-vector-primary',
        },
      },
      snapshot: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectKnowledgeSnapshotSchema', () => {
  it('accepts a representative snapshot object', () => {
    const result = ProjectKnowledgeSnapshotSchema.safeParse({
      projectId: VALID_UUID,
      metaVector: null,
      taxonomy: [],
      relationships: {
        projectId: VALID_UUID,
        outgoing: [],
        incoming: [],
      },
      latestRefresh: null,
      diagnostics: {
        runtimePosture: 'single_process_local',
        refreshInFlight: false,
        confidenceReasonCodes: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects snapshot with invalid runtimePosture value', () => {
    const result = ProjectKnowledgeSnapshotSchema.safeParse({
      projectId: VALID_UUID,
      metaVector: null,
      taxonomy: [],
      relationships: {
        projectId: VALID_UUID,
        outgoing: [],
        incoming: [],
      },
      latestRefresh: null,
      diagnostics: {
        runtimePosture: 'distributed',
        refreshInFlight: false,
        confidenceReasonCodes: [],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectKnowledgeRefreshRecordSchema', () => {
  const SHA256_HASH = 'a'.repeat(64);

  it('accepts a representative record', () => {
    const result = ProjectKnowledgeRefreshRecordSchema.safeParse({
      id: VALID_UUID,
      projectId: VALID_UUID_2,
      trigger: 'manual',
      reasonCode: 'test-refresh',
      inputDigest: SHA256_HASH,
      outcome: 'updated',
      metaVectorState: 'updated',
      taxonomyTagCount: 3,
      relationship: {
        projectId: VALID_UUID_2,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs: [],
      },
      evidenceRefs: [],
      sourcePatternIds: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects record with invalid outcome enum', () => {
    const result = ProjectKnowledgeRefreshRecordSchema.safeParse({
      id: VALID_UUID,
      projectId: VALID_UUID_2,
      trigger: 'manual',
      reasonCode: 'test-refresh',
      inputDigest: SHA256_HASH,
      outcome: 'invalid_outcome',
      metaVectorState: 'updated',
      taxonomyTagCount: 3,
      relationship: {
        projectId: VALID_UUID_2,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs: [],
      },
      evidenceRefs: [],
      sourcePatternIds: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectIdSchema', () => {
  it('accepts a valid UUID', () => {
    expect(ProjectIdSchema.safeParse(VALID_UUID).success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(ProjectIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
