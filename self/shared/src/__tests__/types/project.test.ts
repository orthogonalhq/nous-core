import { describe, it, expect } from 'vitest';
import {
  NodeSchemaDefinition,
  EscalationContractSchema,
  ProjectConfigSchema,
} from '../../types/project.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('NodeSchemaDefinition', () => {
  const validNode = {
    id: VALID_UUID,
    name: 'Validate Identity',
    type: 'quality-gate',
    inputs: { image: 'binary' },
    outputs: { score: 'number' },
    governance: 'must',
    escalation: {
      enabled: true,
      channels: ['in-app'],
      confidenceThreshold: 0.85,
    },
    timeout: {
      durationMs: 30000,
      retries: 2,
      onTimeout: 'halt',
    },
    executionModel: 'synchronous',
  };

  it('accepts a valid node schema', () => {
    expect(NodeSchemaDefinition.safeParse(validNode).success).toBe(true);
  });

  it('accepts optional modelRole', () => {
    const result = NodeSchemaDefinition.safeParse({
      ...validNode,
      modelRole: 'vision',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid governance level', () => {
    const result = NodeSchemaDefinition.safeParse({
      ...validNode,
      governance: 'required',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative timeout', () => {
    const result = NodeSchemaDefinition.safeParse({
      ...validNode,
      timeout: { ...validNode.timeout, durationMs: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('EscalationContractSchema', () => {
  const validContract = {
    context: 'Identity validation failed at 78%',
    triggerReason: 'MUST gate failure',
    recommendation: 'Adjust LoRA training rate',
    requiredAction: 'Approve retry or review',
    channel: 'in-app',
    projectId: VALID_UUID,
    priority: 'high',
    timestamp: NOW,
  };

  it('accepts a valid escalation contract', () => {
    expect(EscalationContractSchema.safeParse(validContract).success).toBe(true);
  });

  it('rejects invalid priority', () => {
    const result = EscalationContractSchema.safeParse({
      ...validContract,
      priority: 'urgent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid channel', () => {
    const result = EscalationContractSchema.safeParse({
      ...validContract,
      channel: 'telegram',
    });
    expect(result.success).toBe(false);
  });
});

describe('ProjectConfigSchema', () => {
  const validConfig = {
    id: VALID_UUID,
    name: 'Deal Scout',
    type: 'hybrid',
    pfcTier: 3,
    memoryAccessPolicy: {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    },
    escalationChannels: ['in-app', 'email'],
    retrievalBudgetTokens: 500,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('accepts a valid project config', () => {
    expect(ProjectConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it('rejects empty project name', () => {
    const result = ProjectConfigSchema.safeParse({
      ...validConfig,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid PFC tier (6)', () => {
    const result = ProjectConfigSchema.safeParse({
      ...validConfig,
      pfcTier: 6,
    });
    expect(result.success).toBe(false);
  });

  it('uses default retrieval budget when not provided', () => {
    const { retrievalBudgetTokens: _, ...nobudget } = validConfig;
    const result = ProjectConfigSchema.safeParse(nobudget);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retrievalBudgetTokens).toBe(500);
    }
  });
});
