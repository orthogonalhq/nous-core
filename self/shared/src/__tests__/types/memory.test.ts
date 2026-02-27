import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEMORY_ACCESS_POLICY,
  MemoryAccessPolicySchema,
  MemoryWriteCandidateSchema,
  ExperienceRecordWriteCandidateSchema,
  MemoryEntrySchema,
  MemoryMutationRequestSchema,
  MemoryMutationAuditRecordSchema,
  MemoryTombstoneSchema,
  StmCompactionSummarySchema,
  ExperienceRecordSchema,
  DistilledPatternSchema,
  RetrievalResultSchema,
} from '../../types/memory.js';
import {
  RetrievalResponseSchema,
  RetrievalBudgetTelemetrySchema,
  RetrievalScoringWeightsSchema,
  DEFAULT_RETRIEVAL_WEIGHTS,
} from '../../types/retrieval.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date().toISOString();

describe('DEFAULT_MEMORY_ACCESS_POLICY', () => {
  it('parses as valid MemoryAccessPolicy', () => {
    expect(
      MemoryAccessPolicySchema.safeParse(DEFAULT_MEMORY_ACCESS_POLICY).success,
    ).toBe(true);
  });

  it('matches schema structure', () => {
    const result = MemoryAccessPolicySchema.safeParse(DEFAULT_MEMORY_ACCESS_POLICY);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canReadFrom).toBe('all');
      expect(result.data.canBeReadBy).toBe('all');
      expect(result.data.inheritsGlobal).toBe(true);
    }
  });
});

describe('MemoryAccessPolicySchema', () => {
  it('accepts "all" / "all" / true', () => {
    const result = MemoryAccessPolicySchema.safeParse({
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts "none" / "none" / false', () => {
    const result = MemoryAccessPolicySchema.safeParse({
      canReadFrom: 'none',
      canBeReadBy: 'none',
      inheritsGlobal: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts project ID arrays', () => {
    const result = MemoryAccessPolicySchema.safeParse({
      canReadFrom: [VALID_UUID],
      canBeReadBy: [VALID_UUID, VALID_UUID_2],
      inheritsGlobal: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid access list value', () => {
    const result = MemoryAccessPolicySchema.safeParse({
      canReadFrom: 'some',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('MemoryWriteCandidateSchema', () => {
  const validCandidate = {
    content: 'User prefers newer roofs',
    type: 'preference',
    scope: 'project',
    projectId: VALID_UUID,
    confidence: 0.85,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: VALID_UUID,
      source: 'pfc',
      timestamp: NOW,
    },
    tags: ['real-estate'],
  };

  it('accepts a valid candidate', () => {
    expect(MemoryWriteCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });

  it('accepts optional mutabilityClass', () => {
    const result = MemoryWriteCandidateSchema.safeParse({
      ...validCandidate,
      mutabilityClass: 'domain-versioned',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = MemoryWriteCandidateSchema.safeParse({
      ...validCandidate,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    const result = MemoryWriteCandidateSchema.safeParse({
      ...validCandidate,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const { content: _, ...incomplete } = validCandidate;
    expect(MemoryWriteCandidateSchema.safeParse(incomplete).success).toBe(false);
  });

  it('accepts optional sentiment', () => {
    const result = MemoryWriteCandidateSchema.safeParse({
      ...validCandidate,
      sentiment: 'strong-positive',
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-experience-record without context/action/outcome/reason (backward compatibility)', () => {
    expect(MemoryWriteCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });
});

describe('ExperienceRecordWriteCandidateSchema', () => {
  const validExpCandidate = {
    content: 'Kitchen gut property rejected',
    type: 'experience-record' as const,
    scope: 'project' as const,
    projectId: VALID_UUID,
    confidence: 0.85,
    sensitivity: [] as string[],
    retention: 'permanent' as const,
    provenance: {
      traceId: VALID_UUID,
      source: 'pfc',
      timestamp: NOW,
    },
    tags: ['real-estate'],
    sentiment: 'strong-negative' as const,
    context: '3-bed property, kitchen gut',
    action: 'Submitted for review',
    outcome: 'rejected',
    reason: 'Repair estimate exceeded tolerance',
  };

  it('accepts valid experience-record candidate with sentiment, context, action, outcome, reason', () => {
    expect(ExperienceRecordWriteCandidateSchema.safeParse(validExpCandidate).success).toBe(true);
  });

  it('rejects when context missing', () => {
    const { context: _, ...noContext } = validExpCandidate;
    expect(ExperienceRecordWriteCandidateSchema.safeParse(noContext).success).toBe(false);
  });

  it('rejects when action missing', () => {
    const { action: _, ...noAction } = validExpCandidate;
    expect(ExperienceRecordWriteCandidateSchema.safeParse(noAction).success).toBe(false);
  });

  it('rejects when outcome missing', () => {
    const { outcome: _, ...noOutcome } = validExpCandidate;
    expect(ExperienceRecordWriteCandidateSchema.safeParse(noOutcome).success).toBe(false);
  });

  it('rejects when reason missing', () => {
    const { reason: _, ...noReason } = validExpCandidate;
    expect(ExperienceRecordWriteCandidateSchema.safeParse(noReason).success).toBe(false);
  });

  it('rejects when sentiment missing', () => {
    const { sentiment: _, ...noSentiment } = validExpCandidate;
    expect(ExperienceRecordWriteCandidateSchema.safeParse(noSentiment).success).toBe(false);
  });

  it('rejects when type is experience-record but sentiment absent', () => {
    const result = ExperienceRecordWriteCandidateSchema.safeParse({
      ...validExpCandidate,
      sentiment: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe('MemoryEntrySchema', () => {
  const validEntry = {
    id: VALID_UUID,
    content: 'A stored fact',
    type: 'fact',
    scope: 'global',
    confidence: 0.9,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: VALID_UUID,
      source: 'pfc',
      timestamp: NOW,
    },
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('accepts a valid entry', () => {
    expect(MemoryEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it('applies legacy compatibility defaults for mutability and lifecycle fields', () => {
    const parsed = MemoryEntrySchema.parse(validEntry);
    expect(parsed.mutabilityClass).toBe('domain-versioned');
    expect(parsed.lifecycleStatus).toBe('active');
    expect(parsed.placementState).toBe('project');
  });

  it('rejects missing id', () => {
    const { id: _, ...incomplete } = validEntry;
    expect(MemoryEntrySchema.safeParse(incomplete).success).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    const result = MemoryEntrySchema.safeParse({
      ...validEntry,
      createdAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

describe('ExperienceRecordSchema', () => {
  const validRecord = {
    id: VALID_UUID,
    content: 'Kitchen gut property rejected',
    type: 'experience-record',
    scope: 'project',
    projectId: VALID_UUID,
    confidence: 0.85,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: VALID_UUID,
      source: 'pfc',
      timestamp: NOW,
    },
    tags: ['real-estate'],
    createdAt: NOW,
    updatedAt: NOW,
    sentiment: 'strong-negative',
    context: '3-bed property, kitchen gut',
    action: 'Submitted for review',
    outcome: 'rejected',
    reason: 'Repair estimate exceeded tolerance',
  };

  it('accepts a valid experience record', () => {
    expect(ExperienceRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it('requires sentiment (not optional)', () => {
    const { sentiment: _, ...noSentiment } = validRecord;
    expect(ExperienceRecordSchema.safeParse(noSentiment).success).toBe(false);
  });

  it('requires context field', () => {
    const { context: _, ...noContext } = validRecord;
    expect(ExperienceRecordSchema.safeParse(noContext).success).toBe(false);
  });

  it('enforces type must be experience-record', () => {
    const result = ExperienceRecordSchema.safeParse({
      ...validRecord,
      type: 'fact',
    });
    expect(result.success).toBe(false);
  });
});

describe('DistilledPatternSchema', () => {
  const validPattern = {
    id: VALID_UUID,
    content: 'User rejects kitchen-gut properties under $400K ARV',
    type: 'distilled-pattern',
    scope: 'project',
    projectId: VALID_UUID,
    confidence: 0.92,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: VALID_UUID,
      source: 'distillation',
      timestamp: NOW,
    },
    tags: ['real-estate'],
    createdAt: NOW,
    updatedAt: NOW,
    basedOn: [VALID_UUID_2],
    supersedes: [VALID_UUID_2],
    evidenceRefs: [{ actionCategory: 'memory-write' as const }],
  };

  it('accepts a valid distilled pattern', () => {
    expect(DistilledPatternSchema.safeParse(validPattern).success).toBe(true);
  });

  it('requires basedOn array (min 1)', () => {
    const { basedOn: _, ...noBasedOn } = validPattern;
    expect(DistilledPatternSchema.safeParse(noBasedOn).success).toBe(false);
  });

  it('rejects empty basedOn', () => {
    expect(
      DistilledPatternSchema.safeParse({
        ...validPattern,
        basedOn: [],
      }).success,
    ).toBe(false);
  });

  it('rejects empty supersedes', () => {
    expect(
      DistilledPatternSchema.safeParse({
        ...validPattern,
        supersedes: [],
      }).success,
    ).toBe(false);
  });

  it('requires evidenceRefs (min 1)', () => {
    const { evidenceRefs: _, ...noEvidenceRefs } = validPattern;
    expect(DistilledPatternSchema.safeParse(noEvidenceRefs).success).toBe(false);
  });

  it('rejects empty evidenceRefs', () => {
    expect(
      DistilledPatternSchema.safeParse({
        ...validPattern,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });

  it('enforces type must be distilled-pattern', () => {
    const result = DistilledPatternSchema.safeParse({
      ...validPattern,
      type: 'fact',
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalResponseSchema', () => {
  const validRetrievalResult = {
    entry: {
      id: VALID_UUID,
      content: 'A fact',
      type: 'fact',
      scope: 'global',
      confidence: 0.9,
      sensitivity: [],
      retention: 'permanent',
      provenance: { traceId: VALID_UUID, source: 'pfc', timestamp: NOW },
      tags: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    score: 0.95,
    components: {
      similarity: 0.9,
      sentimentWeight: 0.8,
      recency: 0.7,
      confidence: 0.9,
    },
  };

  it('accepts valid response with results only', () => {
    const result = RetrievalResponseSchema.safeParse({
      results: [validRetrievalResult],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid response with policyDenial', () => {
    const result = RetrievalResponseSchema.safeParse({
      results: [],
      policyDenial: {
        id: VALID_UUID,
        projectId: VALID_UUID_2,
        action: 'retrieve',
        outcome: 'denied',
        reasonCode: 'POL-GLOBAL-DENIED',
        reason: 'inheritsGlobal is false',
        occurredAt: NOW,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing results', () => {
    const result = RetrievalResponseSchema.safeParse({
      policyDenial: { id: VALID_UUID, projectId: VALID_UUID_2, action: 'retrieve', outcome: 'denied', reasonCode: 'POL-DENIED', reason: 'x', occurredAt: NOW },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid results element', () => {
    const result = RetrievalResponseSchema.safeParse({
      results: [{ invalid: 'result' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalBudgetTelemetrySchema', () => {
  it('accepts valid telemetry', () => {
    const result = RetrievalBudgetTelemetrySchema.safeParse({
      consumedTokens: 150,
      candidateCount: 10,
      truncatedCount: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative consumedTokens', () => {
    const result = RetrievalBudgetTelemetrySchema.safeParse({
      consumedTokens: -1,
      candidateCount: 10,
      truncatedCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer consumedTokens', () => {
    const result = RetrievalBudgetTelemetrySchema.safeParse({
      consumedTokens: 1.5,
      candidateCount: 10,
      truncatedCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalScoringWeightsSchema', () => {
  it('accepts DEFAULT_RETRIEVAL_WEIGHTS', () => {
    const result = RetrievalScoringWeightsSchema.safeParse(DEFAULT_RETRIEVAL_WEIGHTS);
    expect(result.success).toBe(true);
  });

  it('accepts valid weights summing to 1', () => {
    const result = RetrievalScoringWeightsSchema.safeParse({
      wSimilarity: 0.4,
      wSentiment: 0.3,
      wRecency: 0.2,
      wConfidence: 0.1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects weights not summing to 1', () => {
    const result = RetrievalScoringWeightsSchema.safeParse({
      wSimilarity: 0.5,
      wSentiment: 0.5,
      wRecency: 0.1,
      wConfidence: 0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects weight out of range', () => {
    const result = RetrievalScoringWeightsSchema.safeParse({
      wSimilarity: 1.5,
      wSentiment: 0,
      wRecency: 0,
      wConfidence: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalResultSchema', () => {
  it('accepts a valid retrieval result', () => {
    const result = RetrievalResultSchema.safeParse({
      entry: {
        id: VALID_UUID,
        content: 'A fact',
        type: 'fact',
        scope: 'global',
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent',
        provenance: { traceId: VALID_UUID, source: 'pfc', timestamp: NOW },
        tags: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      score: 0.95,
      components: {
        similarity: 0.9,
        sentimentWeight: 0.8,
        recency: 0.7,
        confidence: 0.9,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('MemoryMutationRequestSchema', () => {
  it('accepts a valid mutation request', () => {
    const result = MemoryMutationRequestSchema.safeParse({
      action: 'soft-delete',
      actor: 'operator',
      targetEntryId: VALID_UUID,
      reason: 'cleanup',
      traceId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe('MemoryMutationAuditRecordSchema', () => {
  it('accepts audit record with evidence references', () => {
    const result = MemoryMutationAuditRecordSchema.safeParse({
      id: VALID_UUID,
      sequence: 1,
      action: 'soft-delete',
      actor: 'operator',
      outcome: 'applied',
      reasonCode: 'MEM-SOFT-DELETE-APPLIED',
      reason: 'approved',
      targetEntryId: VALID_UUID_2,
      evidenceRefs: [
        {
          actionCategory: 'memory-write',
          authorizationEventId: VALID_UUID,
        },
      ],
      occurredAt: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('MemoryTombstoneSchema', () => {
  it('accepts a valid tombstone payload', () => {
    const result = MemoryTombstoneSchema.safeParse({
      id: VALID_UUID,
      targetEntryId: VALID_UUID_2,
      targetContentHash:
        'a'.repeat(64),
      deletedByMutationId: VALID_UUID,
      reason: 'legal request',
      createdAt: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('StmCompactionSummarySchema', () => {
  it('accepts compaction summary with provenance refs', () => {
    const result = StmCompactionSummarySchema.safeParse({
      id: VALID_UUID,
      projectId: VALID_UUID_2,
      summary: 'Summarized prior context',
      sourceEntryRefs: [
        {
          timestamp: NOW,
          role: 'user',
          contentHash: 'b'.repeat(64),
        },
      ],
      sourceEntryCount: 1,
      generatedAt: NOW,
    });
    expect(result.success).toBe(true);
  });
});
