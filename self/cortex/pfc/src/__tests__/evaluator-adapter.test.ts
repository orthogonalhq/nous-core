/**
 * Unit tests for createPfcEvaluator adapter.
 */
import { describe, it, expect } from 'vitest';
import { createPfcEvaluator } from '../evaluator-adapter.js';
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
    const pfc = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcEvaluator(pfc);
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

  it('returns approved false when PFC denies', async () => {
    const pfc = new PfcEngine(mockConfig(), mockToolExecutor());
    const evaluator = createPfcEvaluator(pfc);
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
    expect(result.reason).toContain('confidence');
  });
});
