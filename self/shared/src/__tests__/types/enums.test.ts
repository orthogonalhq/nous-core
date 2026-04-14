import { describe, it, expect } from 'vitest';
import {
  PfcTierSchema,
  ModelRoleSchema,
  ProjectTypeSchema,
  GovernanceLevelSchema,
  MemoryTypeSchema,
  MemoryScopeSchema,
  SentimentSchema,
  NodeTypeSchema,
  ExecutionModelSchema,
  ProviderTypeSchema,
  EscalationChannelSchema,
  PackageTypeSchema,
  RetentionPolicySchema,
  EscalationPrioritySchema,
} from '../../types/enums.js';

describe('PfcTierSchema', () => {
  it('accepts valid tiers 0–5', () => {
    for (let i = 0; i <= 5; i++) {
      expect(PfcTierSchema.safeParse(i).success).toBe(true);
    }
  });

  it('rejects tier -1', () => {
    expect(PfcTierSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects tier 6', () => {
    expect(PfcTierSchema.safeParse(6).success).toBe(false);
  });

  it('rejects string "3"', () => {
    expect(PfcTierSchema.safeParse('3').success).toBe(false);
  });

  it('rejects float 2.5', () => {
    expect(PfcTierSchema.safeParse(2.5).success).toBe(false);
  });
});

describe('ModelRoleSchema', () => {
  const validRoles = [
    'cortex-chat', 'cortex-system', 'orchestrators', 'workers',
  ];

  it.each(validRoles)('accepts "%s"', (role) => {
    expect(ModelRoleSchema.safeParse(role).success).toBe(true);
  });

  it('rejects invalid role', () => {
    expect(ModelRoleSchema.safeParse('invalid-role').success).toBe(false);
  });

  const legacyRoles = [
    'reasoner', 'orchestrator', 'tool-advisor', 'summarizer',
    'embedder', 'reranker', 'vision',
  ];

  it.each(legacyRoles)('rejects legacy role "%s"', (role) => {
    expect(ModelRoleSchema.safeParse(role).success).toBe(false);
  });
});

describe('ProjectTypeSchema', () => {
  it.each(['protocol', 'intent', 'hybrid'])('accepts "%s"', (type) => {
    expect(ProjectTypeSchema.safeParse(type).success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(ProjectTypeSchema.safeParse('workflow').success).toBe(false);
  });
});

describe('GovernanceLevelSchema', () => {
  it.each(['must', 'should', 'may'])('accepts "%s"', (level) => {
    expect(GovernanceLevelSchema.safeParse(level).success).toBe(true);
  });

  it('rejects invalid level', () => {
    expect(GovernanceLevelSchema.safeParse('required').success).toBe(false);
  });
});

describe('MemoryTypeSchema', () => {
  const validTypes = [
    'fact', 'preference', 'experience-record', 'distilled-pattern', 'task-state',
  ];

  it.each(validTypes)('accepts "%s"', (type) => {
    expect(MemoryTypeSchema.safeParse(type).success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(MemoryTypeSchema.safeParse('note').success).toBe(false);
  });
});

describe('MemoryScopeSchema', () => {
  it.each(['global', 'project'])('accepts "%s"', (scope) => {
    expect(MemoryScopeSchema.safeParse(scope).success).toBe(true);
  });
});

describe('SentimentSchema', () => {
  const validSentiments = [
    'strong-positive', 'weak-positive', 'neutral', 'weak-negative', 'strong-negative',
  ];

  it.each(validSentiments)('accepts "%s"', (s) => {
    expect(SentimentSchema.safeParse(s).success).toBe(true);
  });
});

describe('NodeTypeSchema', () => {
  const validTypes = [
    'model-call', 'tool-execution', 'quality-gate',
    'human-decision', 'condition', 'transform',
    'parallel-split', 'parallel-join', 'loop', 'error-handler',
  ];

  it.each(validTypes)('accepts "%s"', (type) => {
    expect(NodeTypeSchema.safeParse(type).success).toBe(true);
  });
});

describe('ExecutionModelSchema', () => {
  it.each(['synchronous', 'streaming', 'async-batch', 'scheduled'])('accepts "%s"', (model) => {
    expect(ExecutionModelSchema.safeParse(model).success).toBe(true);
  });
});

describe('ProviderTypeSchema', () => {
  it.each(['text', 'image', 'video', 'vision', 'embedding', 'external-api'])('accepts "%s"', (type) => {
    expect(ProviderTypeSchema.safeParse(type).success).toBe(true);
  });
});

describe('EscalationChannelSchema', () => {
  it.each(['in-app', 'push', 'signal', 'slack', 'sms', 'email', 'voice'])('accepts "%s"', (ch) => {
    expect(EscalationChannelSchema.safeParse(ch).success).toBe(true);
  });
});

describe('PackageTypeSchema', () => {
  it.each(['skill', 'project', 'app', 'workflow'])('accepts "%s"', (type) => {
    expect(PackageTypeSchema.safeParse(type).success).toBe(true);
  });

  it('rejects unsupported package types', () => {
    expect(PackageTypeSchema.safeParse('plugin').success).toBe(false);
  });
});

describe('RetentionPolicySchema', () => {
  it.each(['permanent', 'session', 'ttl'])('accepts "%s"', (r) => {
    expect(RetentionPolicySchema.safeParse(r).success).toBe(true);
  });
});

describe('EscalationPrioritySchema', () => {
  it.each(['low', 'medium', 'high', 'critical'])('accepts "%s"', (p) => {
    expect(EscalationPrioritySchema.safeParse(p).success).toBe(true);
  });
});
