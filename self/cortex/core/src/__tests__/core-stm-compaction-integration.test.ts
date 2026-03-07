import { describe, expect, it } from 'vitest';
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
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import { WitnessService } from '@nous/subcortex-witnessd';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import type { IConfig } from '@nous/shared';

function mockConfig(): IConfig {
  const config = {
    pfcTier: 3,
    modelRoleAssignments: [
      { role: 'reasoner', providerId: '00000000-0000-0000-0000-000000000001' },
    ],
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

describe('Core STM compaction integration', () => {
  it('routes turn-finalization compaction through the MWC audit seam', async () => {
    const dbPath = join(
      tmpdir(),
      `nous-core-stm-compaction-${randomUUID()}.sqlite`,
    );
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const projectId = randomUUID() as import('@nous/shared').ProjectId;

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore, {
      compactionPolicy: {
        maxContextTokens: 9,
        targetContextTokens: 8,
        minEntriesBeforeCompaction: 4,
        retainedRecentEntries: 2,
      },
    });
    const config = mockConfig();
    const Cortex = new PfcEngine(config, new ToolExecutor());
    const witnessService = new WitnessService(documentStore, {
      checkpointInterval: 100,
    });
    const projectStore = new DocumentProjectStore(documentStore);
    const mwcPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createPfcEvaluator(Cortex),
      createPfcMutationEvaluator(Cortex),
    );

    await projectStore.create({
      id: projectId,
      name: 'STM Compaction Project',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      escalationChannels: ['in-app'],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    for (let i = 0; i < 4; i++) {
      await stmStore.append(projectId, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `ctx ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'pong',
          toolCalls: [],
          memoryCandidates: [],
        }),
        providerId:
          '00000000-0000-0000-0000-000000000001' as import('@nous/shared').ProviderId,
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
      projectStore,
      documentStore,
      witnessService,
      policyEngine: new MemoryAccessPolicyEngine(),
    });

    const result = await executor.executeTurn({
      message: 'ping',
      projectId,
      traceId,
    });

    expect(result.response).toBe('pong');

    const context = await stmStore.getContext(projectId);
    expect(context.entries).toHaveLength(2);
    expect(context.summary).toBeTruthy();
    expect(context.compactionState?.requiresCompaction).toBe(false);

    const audit = await mwcPipeline.listMutationAudit(projectId);
    expect(
      audit.some(
        (record) =>
          record.action === 'compact-stm' && record.outcome === 'applied',
      ),
    ).toBe(true);
  });
});
