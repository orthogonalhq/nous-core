/**
 * Unit tests for createPfcEvaluator adapter.
 */
import { describe, it, expect } from 'vitest';
import {
  createPfcEvaluator,
  createPfcMutationEvaluator,
} from '../evaluator-adapter.js';
import { PfcEngine } from '../pfc-engine.js';
import type { IConfig, IToolExecutor } from '@nous/shared';

function mockConfig(): IConfig {
  return {
    get: () => ({ pfcTier: 3 } as ReturnType<IConfig['get']>),
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

function mockToolExecutor(): IToolExecutor {
  return {
    execute: async () => ({ success: true, output: null, durationMs: 0 }),
    listTools: async () => [],
  };
}

describe('createPfcEvaluator', () => {
  it('maps PfcDecision to MwcEvaluator return shape when approved', async () => {
    const Cortex = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcEvaluator(Cortex);
    const result = await evaluator(
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
    expect(result.approved).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it('returns approved false when Cortex denies', async () => {
    const Cortex = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcEvaluator(Cortex);
    const result = await evaluator(
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
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('MEM-CONFIDENCE-BELOW-THRESHOLD');
  });
});

describe('createPfcMutationEvaluator', () => {
  it('maps mutation denial to reasonCode when reason uses MEM prefix', async () => {
    const Cortex = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcMutationEvaluator(Cortex);
    const result = await evaluator({
      action: 'hard-delete',
      actor: 'operator',
      targetEntryId: '00000000-0000-0000-0000-000000000001' as never,
      reason: 'test',
      traceId: '00000000-0000-0000-0000-000000000001' as never,
      evidenceRefs: [],
    });

    expect(result.approved).toBe(false);
    expect(result.reasonCode).toBe('MEM-HARD-DELETE-REQUIRES-OVERRIDE');
  });

  it('maps approved mutation to MEM reasonCode', async () => {
    const Cortex = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcMutationEvaluator(Cortex);
    const result = await evaluator({
      action: 'soft-delete',
      actor: 'operator',
      targetEntryId: '00000000-0000-0000-0000-000000000001' as never,
      reason: 'cleanup',
      traceId: '00000000-0000-0000-0000-000000000001' as never,
      evidenceRefs: [],
    });

    expect(result.approved).toBe(true);
    expect(result.reasonCode).toBe('MEM-MUTATION-APPROVED');
  });
});
