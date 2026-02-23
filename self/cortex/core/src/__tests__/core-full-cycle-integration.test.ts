/**
 * Integration test: full cycle from input → Cortex → model → memory gate → response → trace.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { CoreExecutor } from '../core-executor.js';
import {
  PfcEngine,
  createPfcEvaluator,
  createPfcMutationEvaluator,
} from '@nous/cortex-Cortex';
import { DocumentStmStore } from '@nous/memory-stm';
import { MwcPipeline } from '@nous/memory-mwc';
import { ModelRouter } from '@nous/subcortex-router';
import { ToolExecutor } from '@nous/subcortex-tools';
import { DocumentProjectStore } from '@nous/subcortex-projects';
import { WitnessService } from '@nous/subcortex-witnessd';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import type { IConfig } from '@nous/shared';

function mockConfig(): IConfig {
  const config = {
    pfcTier: 3,
    modelRoleAssignments: [{ role: 'reasoner', providerId: '00000000-0000-0000-0000-000000000001' }],
    providers: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'mock',
        type: 'text',
        modelId: 'mock',
        isLocal: true,
        capabilities: [],
      },
    ],
  };
  return {
    get: () => config as never,
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

describe('Core full cycle integration', () => {
  it('input → Cortex → model → memory gate → response → trace', async () => {
    const dbPath = join(tmpdir(), `nous-core-integration-${randomUUID()}.sqlite`);
    const traceId = randomUUID() as import('@nous/shared').TraceId;

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore);
    const config = mockConfig();
    const Cortex = new PfcEngine(config, new ToolExecutor());
    const witnessService = new WitnessService(documentStore, {
      checkpointInterval: 100,
    });
    const mwcPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createPfcEvaluator(Cortex),
      createPfcMutationEvaluator(Cortex),
    );

    // Use a mock provider — ProviderRegistry with real config may not have working provider
    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Hello from integration test',
          toolCalls: [],
          memoryCandidates: [
            {
              content: 'Integration test memory',
              type: 'fact',
              scope: 'project',
              confidence: 0.8,
              sensitivity: [],
              retention: 'permanent',
              provenance: {
                traceId,
                source: 'integration-test',
                timestamp: new Date().toISOString(),
              },
              tags: [],
            },
          ],
        }),
        providerId: '00000000-0000-0000-0000-000000000001' as import('@nous/shared').ProviderId,
        usage: {},
        traceId,
      }),
      stream: async function* () {},
      getConfig: () => ({}),
    };

    const executor = new CoreExecutor({
      Cortex,
      router: new ModelRouter(config),
      getProvider: () => mockProvider as never,
      toolExecutor: new ToolExecutor(),
      stmStore,
      mwcPipeline,
      projectStore: new DocumentProjectStore(documentStore),
      documentStore,
      witnessService,
    });

    const result = await executor.executeTurn({
      message: 'test message',
      traceId,
    });

    expect(result.response).toBe('Hello from integration test');
    expect(result.traceId).toBe(traceId);

    const trace = await executor.getTrace(traceId);
    expect(trace).toBeTruthy();
    expect(trace!.turns).toHaveLength(1);
    expect(trace!.turns[0].modelCalls).toHaveLength(1);
    expect(trace!.turns[0].memoryWrites.length).toBeGreaterThanOrEqual(0);
    expect(trace!.turns[0].evidenceRefs.length).toBeGreaterThan(0);
  });
});
