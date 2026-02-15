import { describe, it, expect } from 'vitest';
import {
  MemoryAccessPolicySchema,
  MemoryWriteCandidateSchema,
  MemoryEntrySchema,
  ExperienceRecordSchema,
  DistilledPatternSchema,
  RetrievalResultSchema,
} from '../../types/memory.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date().toISOString();

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
  };

  it('accepts a valid distilled pattern', () => {
    expect(DistilledPatternSchema.safeParse(validPattern).success).toBe(true);
  });

  it('requires basedOn array', () => {
    const { basedOn: _, ...noBasedOn } = validPattern;
    expect(DistilledPatternSchema.safeParse(noBasedOn).success).toBe(false);
  });

  it('enforces type must be distilled-pattern', () => {
    const result = DistilledPatternSchema.safeParse({
      ...validPattern,
      type: 'fact',
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
