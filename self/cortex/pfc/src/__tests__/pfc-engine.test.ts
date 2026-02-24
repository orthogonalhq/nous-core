/**
 * Unit tests for PfcEngine.
 */
import { describe, it, expect } from 'vitest';
import { PfcEngine } from '../pfc-engine.js';
import type { IConfig, IToolExecutor, ToolDefinition } from '@nous/shared';

function mockConfig(pfcTier: number): IConfig {
  return {
    get: () => ({ pfcTier } as ReturnType<IConfig['get']>),
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

function mockToolExecutor(toolNames: string[]): IToolExecutor {
  const tools: ToolDefinition[] = toolNames.map((name) => ({
    name,
    version: '1.0.0',
    description: '',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    capabilities: [],
    permissionScope: 'project',
  }));
  return {
    execute: async () => ({ success: true, output: null, durationMs: 0 }),
    listTools: async () => tools,
  };
}

describe('PfcEngine', () => {
  it('implements IPfcEngine contract', () => {
    const pfc = new PfcEngine(
      mockConfig(3),
      mockToolExecutor(['echo']),
    );
    expect(pfc).toBeDefined();
    expect(typeof pfc.evaluateMemoryWrite).toBe('function');
    expect(typeof pfc.evaluateMemoryMutation).toBe('function');
    expect(typeof pfc.evaluateToolExecution).toBe('function');
    expect(typeof pfc.reflect).toBe('function');
    expect(typeof pfc.evaluateEscalation).toBe('function');
    expect(typeof pfc.getTier).toBe('function');
  });

  describe('evaluateMemoryWrite', () => {
    it('denies candidate with confidence < 0.5', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.3,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );
      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-CONFIDENCE-BELOW-THRESHOLD');
    });

    it('approves candidate with confidence >= 0.5', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.8,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );
      expect(decision.approved).toBe(true);
      expect(decision.reason).toBe('MEM-WRITE-APPROVED');
    });
  });

  describe('evaluateMemoryMutation', () => {
    const traceId = '00000000-0000-0000-0000-000000000001' as never;

    it('denies direct core actor mutation attempts', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'soft-delete',
        actor: 'core',
        targetEntryId: '00000000-0000-0000-0000-000000000002' as never,
        reason: 'test',
        traceId,
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-ACTOR-BOUNDARY-BLOCKED');
    });

    it('denies hard-delete without principal override', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'hard-delete',
        actor: 'operator',
        targetEntryId: '00000000-0000-0000-0000-000000000003' as never,
        reason: 'cleanup',
        traceId,
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-HARD-DELETE-REQUIRES-OVERRIDE');
    });

    it('approves hard-delete with principal override', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'hard-delete',
        actor: 'operator',
        targetEntryId: '00000000-0000-0000-0000-000000000004' as never,
        reason: 'legal request',
        traceId,
        principalOverride: { rationale: 'principal approved destructive erase' },
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(true);
      expect(decision.reason).toBe('MEM-MUTATION-APPROVED');
    });

    it('denies create mutation when replacement candidate confidence is below threshold', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'create',
        actor: 'pfc',
        reason: 'test',
        traceId,
        evidenceRefs: [],
        replacementCandidate: {
          content: 'candidate',
          type: 'fact',
          scope: 'project',
          confidence: 0.2,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-CONFIDENCE-BELOW-THRESHOLD');
    });
  });

  describe('evaluateToolExecution', () => {
    it('denies tool not in listTools', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor(['echo']),
      );
      const decision = await pfc.evaluateToolExecution('unknown_tool', {}, undefined);
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('not registered');
    });

    it('approves tool in listTools', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor(['echo']),
      );
      const decision = await pfc.evaluateToolExecution('echo', {}, undefined);
      expect(decision.approved).toBe(true);
      expect(decision.reason).toContain('passed');
    });
  });

  describe('reflect', () => {
    it('returns fixed confidence and qualityScore', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const result = await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });
      expect(result.confidence).toBe(0.8);
      expect(result.qualityScore).toBe(0.8);
      expect(result.shouldEscalate).toBe(false);
    });
  });

  describe('evaluateEscalation', () => {
    it('returns shouldEscalate true when confidence < 0.3', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateEscalation({
        trigger: 'low_confidence',
        context: 'test',
        confidence: 0.2,
      });
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.reason).toContain('low confidence');
    });

    it('returns shouldEscalate false when confidence >= 0.3', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateEscalation({
        trigger: 'test',
        context: 'test',
        confidence: 0.8,
      });
      expect(decision.shouldEscalate).toBe(false);
    });
  });

  describe('getTier', () => {
    it('returns config pfcTier when valid', () => {
      const pfc = new PfcEngine(
        mockConfig(4),
        mockToolExecutor([]),
      );
      expect(pfc.getTier()).toBe(4);
    });

    it('returns default 3 when pfcTier invalid', () => {
      const config = {
        get: () => ({}),
        getSection: () => ({}),
        update: async () => {},
        reload: async () => {},
      } as IConfig;
      const pfc = new PfcEngine(config, mockToolExecutor([]));
      expect(pfc.getTier()).toBe(3);
    });
  });
});
