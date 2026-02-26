/**
 * Integration test: Cortex denies memory write; denial is traced.
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
} from '@nous/cortex-pfc';
import { DocumentStmStore } from '@nous/memory-stm';
import { MwcPipeline } from '@nous/memory-mwc';
import { ModelRouter } from '@nous/subcortex-router';
import { ToolExecutor } from '@nous/subcortex-tools';
import { DocumentProjectStore } from '@nous/subcortex-projects';
import { WitnessService } from '@nous/subcortex-witnessd';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import type { IConfig } from '@nous/shared';

function mockConfig(): IConfig {
  return {
    get: () => ({
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
    } as never),
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

describe('Core MWC denial integration', () => {
  it('Cortex denies low-confidence candidate; denial traced; no persist', async () => {
    const dbPath = join(tmpdir(), `nous-mwc-denial-${randomUUID()}.sqlite`);
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const projectId = randomUUID() as import('@nous/shared').ProjectId;

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

    // Model returns a low-confidence candidate (0.3) — Cortex will deny
    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Response',
          toolCalls: [],
          memoryCandidates: [
            {
              content: 'Should be denied',
              type: 'fact',
              scope: 'project',
              confidence: 0.3,
              sensitivity: [],
              retention: 'permanent',
              provenance: {
                traceId,
                source: 'denial-test',
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
      policyEngine: new MemoryAccessPolicyEngine(),
    });

    await executor.executeTurn({
      message: 'test',
      traceId,
      projectId,
    });

    const trace = await executor.getTrace(traceId);
    expect(trace).toBeTruthy();
    expect(trace!.turns[0].memoryDenials).toHaveLength(1);
    expect(trace!.turns[0].memoryDenials[0].reason).toContain('CONFIDENCE');
    expect(trace!.turns[0].memoryWrites).toHaveLength(0);
    expect(trace!.turns[0].evidenceRefs.length).toBeGreaterThan(0);

    // Verify no entry persisted for this project
    const exportData = await mwcPipeline.exportForProject(projectId);
    expect(exportData.entries).toHaveLength(0);
  });
});
