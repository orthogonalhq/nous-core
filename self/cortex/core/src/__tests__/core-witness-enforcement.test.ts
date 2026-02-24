import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CoreExecutor } from '../core-executor.js';
import type {
  IDocumentStore,
  IModelProvider,
  IModelRouter,
  IPfcEngine,
  IProjectStore,
  IStmStore,
  IToolExecutor,
  IWitnessService,
  WitnessEvent,
} from '@nous/shared';

const TRACE_ID = randomUUID() as import('@nous/shared').TraceId;
const PROVIDER_ID = randomUUID() as import('@nous/shared').ProviderId;

function createDocumentStore(): IDocumentStore {
  const rows = new Map<string, unknown>();
  return {
    put: vi.fn().mockImplementation(async (_collection, id, value) => {
      rows.set(id, value);
    }),
    get: vi.fn().mockImplementation(async (_collection, id) => rows.get(id) ?? null),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function createPfc(): IPfcEngine {
  return {
    evaluateMemoryWrite: vi.fn().mockResolvedValue({
      approved: true,
      reason: 'ok',
      confidence: 1,
    }),
    evaluateMemoryMutation: vi.fn().mockResolvedValue({
      approved: true,
      reason: 'MEM-MUTATION-APPROVED',
      confidence: 1,
    }),
    evaluateToolExecution: vi.fn().mockResolvedValue({
      approved: true,
      reason: 'ok',
      confidence: 1,
    }),
    reflect: vi.fn().mockResolvedValue({
      confidence: 1,
      qualityScore: 1,
      flags: [],
      shouldEscalate: false,
    }),
    evaluateEscalation: vi.fn().mockResolvedValue({
      shouldEscalate: false,
      reason: 'ok',
    }),
    getTier: vi.fn().mockReturnValue(3),
  };
}

function createRouter(): IModelRouter {
  return {
    route: vi.fn().mockResolvedValue(PROVIDER_ID),
    routeWithEvidence: vi.fn().mockResolvedValue({
      providerId: PROVIDER_ID,
      evidence: {
        profileId: 'hybrid_controlled',
        policyLink: 'block_if_unmet',
        capabilityProfile: 'review-standard',
        selectedProviderId: PROVIDER_ID,
      },
    }),
    listProviders: vi.fn().mockResolvedValue([]),
  };
}

function createProvider(): IModelProvider {
  return {
    invoke: vi.fn().mockResolvedValue({
      output: JSON.stringify({
        response: 'tool sequence',
        toolCalls: [
          { name: 'tool-a', params: {} },
          { name: 'tool-b', params: {} },
        ],
        memoryCandidates: [],
      }),
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    }),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({}),
  };
}

function createToolExecutor(): IToolExecutor {
  return {
    execute: vi.fn().mockRejectedValue(new Error('tool execution failed')),
    listTools: vi.fn().mockResolvedValue([]),
  };
}

function createStmStore(): IStmStore {
  return {
    getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
    append: vi.fn().mockResolvedValue(undefined),
    compact: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function createProjectStore(): IProjectStore {
  return {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  };
}

function createWitnessEvent(overrides: Partial<WitnessEvent>): WitnessEvent {
  return {
    id: randomUUID() as import('@nous/shared').WitnessEventId,
    sequence: 1,
    previousEventHash: null,
    payloadHash: 'a'.repeat(64),
    eventHash: 'b'.repeat(64),
    stage: 'authorization',
    actionCategory: 'tool-execute',
    actionRef: 'tool-a',
    actor: 'system',
    status: 'approved',
    detail: {},
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createWitnessService(
  enforcement: 'auto-pause' | 'hard-stop',
): IWitnessService {
  return {
    appendAuthorization: vi.fn().mockImplementation(async (input) =>
      createWitnessEvent({
        stage: 'authorization',
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: input.actor,
        status: input.status,
      })),
    appendCompletion: vi.fn().mockImplementation(async (input) => {
      if (input.status === 'failed') {
        throw new Error('witness completion append failed');
      }
      return createWitnessEvent({
        stage: 'completion',
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: input.actor,
        status: input.status,
        authorizationRef: input.authorizationRef,
      });
    }),
    appendInvariant: vi.fn().mockImplementation(async (input) =>
      createWitnessEvent({
        stage: 'invariant',
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: input.actor,
        status: enforcement === 'hard-stop' ? 'blocked' : 'failed',
        invariantCode: input.code,
        detail: {
          enforcement,
        },
      })),
    createCheckpoint: vi.fn().mockResolvedValue(
      {} as import('@nous/shared').WitnessCheckpoint,
    ),
    rotateKeyEpoch: vi.fn().mockResolvedValue(1),
    verify: vi.fn().mockResolvedValue(
      {} as import('@nous/shared').VerificationReport,
    ),
    getReport: vi.fn().mockResolvedValue(null),
    listReports: vi.fn().mockResolvedValue([]),
    getLatestCheckpoint: vi.fn().mockResolvedValue(null),
  };
}

describe('Core witness enforcement ladder', () => {
  it('applies S1 auto-pause and stops remaining tool execution after completion evidence failure', async () => {
    const toolExecutor = createToolExecutor();
    const executor = new CoreExecutor({
      Cortex: createPfc(),
      router: createRouter(),
      getProvider: () => createProvider(),
      toolExecutor,
      stmStore: createStmStore(),
      mwcPipeline: { submit: vi.fn().mockResolvedValue(null) },
      projectStore: createProjectStore(),
      documentStore: createDocumentStore(),
      witnessService: createWitnessService('auto-pause'),
    });

    const result = await executor.executeTurn({
      message: 'trigger tools',
      traceId: TRACE_ID,
    });

    expect(result.response).toBe('tool sequence');
    expect(result.pfcDecisions.some((d) => d.reason.includes('S1 auto pause'))).toBe(
      true,
    );
    expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it('applies S0 hard-stop when invariant enforcement escalates to hard-stop', async () => {
    const toolExecutor = createToolExecutor();
    const executor = new CoreExecutor({
      Cortex: createPfc(),
      router: createRouter(),
      getProvider: () => createProvider(),
      toolExecutor,
      stmStore: createStmStore(),
      mwcPipeline: { submit: vi.fn().mockResolvedValue(null) },
      projectStore: createProjectStore(),
      documentStore: createDocumentStore(),
      witnessService: createWitnessService('hard-stop'),
    });

    const result = await executor.executeTurn({
      message: 'trigger hard stop',
      traceId: TRACE_ID,
    });

    expect(result.response).toContain('Critical action blocked by S0 invariant');
    expect(result.pfcDecisions.some((d) => d.reason.includes('S0 hard stop'))).toBe(
      true,
    );
    expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
  });
});
