/**
 * Integration test: routeWithEvidence → provider invoke → trace contains evidence.
 *
 * Phase 2.3: Validates route → evidence → trace flow with real router and mocked provider.
 */
import { describe, it, expect, vi } from 'vitest';
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

const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as const;

function mockConfig(): IConfig {
  const config = {
    pfcTier: 3,
    modelRoleAssignments: [{ role: 'reasoner', providerId: PROVIDER_ID }],
    providers: [
      {
        id: PROVIDER_ID,
        name: 'mock',
        type: 'text',
        modelId: 'mock',
        isLocal: true,
        capabilities: ['text'],
        meetsProfiles: ['review-standard'],
      },
    ],
    profile: {
      name: 'hybrid_controlled',
      description: 'Hybrid',
      defaultProviderType: 'local',
      allowLocalProviders: true,
      allowRemoteProviders: true,
      allowSilentLocalToRemoteFailover: false,
    },
  };
  return {
    get: () => config as never,
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

describe('Core provider routing integration', () => {
  it('routeWithEvidence → provider invoke → trace contains route evidence', async () => {
    const dbPath = join(tmpdir(), `nous-core-routing-${randomUUID()}.sqlite`);
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

    const appendAuthorizationSpy = vi.spyOn(
      witnessService,
      'appendAuthorization',
    );

    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Hello',
          toolCalls: [],
          memoryCandidates: [],
        }),
        providerId: PROVIDER_ID as import('@nous/shared').ProviderId,
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

    const result = await executor.executeTurn({
      message: 'test',
      traceId,
    });

    expect(result.response).toBe('Hello');
    expect(result.traceId).toBe(traceId);

    const trace = await executor.getTrace(traceId);
    expect(trace).toBeTruthy();
    expect(trace!.turns).toHaveLength(1);
    expect(trace!.turns[0].modelCalls).toHaveLength(1);

    const modelCall = trace!.turns[0].modelCalls[0];
    expect(modelCall.routeEvidence).toBeDefined();
    expect(modelCall.routeEvidence!.profileId).toBe('hybrid_controlled');
    expect(modelCall.routeEvidence!.policyLink).toBe('block_if_unmet');
    expect(modelCall.routeEvidence!.capabilityProfile).toBe('review-standard');
    expect(modelCall.routeEvidence!.selectedProviderId).toBe(PROVIDER_ID);

    const modelInvokeAuth = appendAuthorizationSpy.mock.calls.find(
      (c) => c[0].actionCategory === 'model-invoke',
    );
    expect(modelInvokeAuth).toBeDefined();
    expect(modelInvokeAuth![0].detail).toHaveProperty('routeEvidence');
    expect(modelInvokeAuth![0].detail.routeEvidence).toHaveProperty('profileId');
    expect(modelInvokeAuth![0].detail.routeEvidence).toHaveProperty('policyLink');
  });

  it('Principal override evidence allows dispatch when PRV-THRESHOLD-MISS', async () => {
    const configWithThresholdMiss = {
      ...mockConfig(),
      get: () =>
        ({
          pfcTier: 3,
          modelRoleAssignments: [{ role: 'reasoner', providerId: PROVIDER_ID }],
          providers: [
            {
              id: PROVIDER_ID,
              name: 'mock',
              type: 'text',
              modelId: 'mock',
              isLocal: true,
              capabilities: ['text'],
              meetsProfiles: ['prompt-generation'],
            },
          ],
          profile: {
            name: 'hybrid_controlled',
            description: 'Hybrid',
            defaultProviderType: 'local',
            allowLocalProviders: true,
            allowRemoteProviders: true,
            allowSilentLocalToRemoteFailover: false,
          },
        }) as never,
    };

    const dbPath = join(tmpdir(), `nous-core-routing-${randomUUID()}.sqlite`);
    const traceId = randomUUID() as import('@nous/shared').TraceId;

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore);
    const Cortex = new PfcEngine(configWithThresholdMiss, new ToolExecutor());
    const witnessService = new WitnessService(documentStore, {
      checkpointInterval: 100,
    });
    const mwcPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createPfcEvaluator(Cortex),
      createPfcMutationEvaluator(Cortex),
    );

    const mockProvider = {
      invoke: async () => ({
        output: JSON.stringify({
          response: 'Override allowed',
          toolCalls: [],
          memoryCandidates: [],
        }),
        providerId: PROVIDER_ID as import('@nous/shared').ProviderId,
        usage: {},
        traceId,
      }),
      stream: async function* () {},
      getConfig: () => ({}),
    };

    const executor = new CoreExecutor({
      Cortex,
      router: new ModelRouter(configWithThresholdMiss),
      getProvider: () => mockProvider as never,
      toolExecutor: new ToolExecutor(),
      stmStore,
      mwcPipeline,
      projectStore: new DocumentProjectStore(documentStore),
      documentStore,
      witnessService,
      policyEngine: new MemoryAccessPolicyEngine(),
    });

    const result = await executor.executeTurn({
      message: 'test',
      traceId,
      principalOverrideEvidence: true,
    });

    expect(result.response).toBe('Override allowed');

    const trace = await executor.getTrace(traceId);
    expect(trace!.turns[0].modelCalls[0].routeEvidence).toBeDefined();
    expect(trace!.turns[0].modelCalls[0].routeEvidence!.failoverReasonCode).toBe(
      'PRV-PRINCIPAL-OVERRIDE',
    );
  });
});
