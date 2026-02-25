/**
 * Integration test: Policy engine denies cross-project memory write; denial traced with decisionRecord.
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
import { DEFAULT_MEMORY_ACCESS_POLICY } from '@nous/shared';

function mockConfig(): IConfig {
  return {
    get: () => ({
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
    } as never),
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

describe('Core policy enforcement', () => {
  it('policy denies global-scope write when inheritsGlobal false; denial has decisionRecord', async () => {
    const dbPath = join(tmpdir(), `nous-policy-enf-${randomUUID()}.sqlite`);
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

    const projectStore = new DocumentProjectStore(documentStore);
    await projectStore.create({
      id: projectId,
      name: 'Sealed Project',
      type: 'protocol',
      pfcTier: 0,
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: false,
      },
      escalationChannels: [],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Response',
          toolCalls: [],
          memoryCandidates: [
            {
              content: 'Should be denied by policy',
              type: 'fact',
              scope: 'global',
              confidence: 0.9,
              sensitivity: [],
              retention: 'permanent',
              provenance: {
                traceId,
                source: 'policy-test',
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
      projectStore,
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
    expect(trace!.turns[0].memoryDenials[0].reason).toContain('POL-GLOBAL-DENIED');
    expect(trace!.turns[0].memoryDenials[0].decisionRecord).toBeDefined();
    expect(trace!.turns[0].memoryDenials[0].decisionRecord!.reasonCode).toBe(
      'POL-GLOBAL-DENIED',
    );
    expect(trace!.turns[0].memoryWrites).toHaveLength(0);
  });

  it('policy allows global-scope write when inheritsGlobal true; submit proceeds', async () => {
    const dbPath = join(tmpdir(), `nous-policy-allow-${randomUUID()}.sqlite`);
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

    const projectStore = new DocumentProjectStore(documentStore);
    await projectStore.create({
      id: projectId,
      name: 'Open Project',
      type: 'protocol',
      pfcTier: 0,
      memoryAccessPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      escalationChannels: [],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Response',
          toolCalls: [],
          memoryCandidates: [
            {
              content: 'Should be allowed',
              type: 'fact',
              scope: 'global',
              confidence: 0.9,
              sensitivity: [],
              retention: 'permanent',
              provenance: {
                traceId,
                source: 'policy-test',
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
      projectStore,
      documentStore,
      witnessService,
      policyEngine: new MemoryAccessPolicyEngine(),
    });

    const result = await executor.executeTurn({
      message: 'test',
      traceId,
      projectId,
    });

    expect(result.response).toBe('Response');
    const trace = await executor.getTrace(traceId);
    expect(trace!.turns[0].memoryWrites).toHaveLength(1);
    expect(trace!.turns[0].memoryDenials).toHaveLength(0);
  });
});
