/**
 * Unit tests for CoreExecutor.
 */
import { describe, it, expect, vi } from 'vitest';
import { CoreExecutor } from '../core-executor.js';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import type {
  IPfcEngine,
  IModelRouter,
  IModelProvider,
  IToolExecutor,
  IStmStore,
  IProjectStore,
  IDocumentStore,
  IWitnessService,
} from '@nous/shared';
import { randomUUID } from 'node:crypto';

const policyEngine = new MemoryAccessPolicyEngine();

const traceId = randomUUID() as import('@nous/shared').TraceId;

function mockPfc(): IPfcEngine {
  const patternId = randomUUID() as import('@nous/shared').MemoryEntryId;
  const evidenceRefs = [{ actionCategory: 'trace-persist' as const }];
  return {
    evaluateConfidenceGovernance: vi.fn().mockResolvedValue({
      outcome: 'allow_with_flag',
      reasonCode: 'CGR-ALLOW-WITH-FLAG',
      governance: 'should',
      actionCategory: 'model-invoke',
      patternId,
      confidence: 0.8,
      confidenceTier: 'medium',
      supportingSignals: 8,
      decayState: 'stable',
      autonomyAllowed: false,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
      evidenceRefs,
      explanation: {
        patternId,
        outcomeRef: 'outcome-1',
        evidenceRefs,
      },
    }),
    evaluateMemoryWrite: vi.fn().mockResolvedValue({
      approved: true,
      reason: 'ok',
      confidence: 0.8,
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
      confidence: 0.8,
      qualityScore: 0.8,
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

const MOCK_PROVIDER_ID = randomUUID() as import('@nous/shared').ProviderId;

function mockRouter(): IModelRouter {
  return {
    route: vi.fn().mockResolvedValue(MOCK_PROVIDER_ID),
    routeWithEvidence: vi.fn().mockResolvedValue({
      providerId: MOCK_PROVIDER_ID,
      evidence: {
        profileId: 'hybrid_controlled',
        policyLink: 'block_if_unmet',
        capabilityProfile: 'review-standard',
        selectedProviderId: MOCK_PROVIDER_ID,
      },
    }),
    listProviders: vi.fn().mockResolvedValue([]),
  };
}

function mockProvider(output: string): IModelProvider {
  return {
    invoke: vi.fn().mockResolvedValue({
      output,
      providerId: MOCK_PROVIDER_ID,
      usage: { inputTokens: 0, outputTokens: 0 },
      traceId,
    }),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({}),
  };
}

function mockToolExecutor(): IToolExecutor {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: null,
      durationMs: 0,
    }),
    listTools: vi.fn().mockResolvedValue([
      {
        name: 'echo',
        version: '1.0',
        description: '',
        inputSchema: {},
        outputSchema: {},
        capabilities: [],
        permissionScope: 'project',
      },
    ]),
  };
}

function mockStmStore(): IStmStore {
  return {
    getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
    append: vi.fn().mockResolvedValue(undefined),
    compact: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function mockMwcPipeline(): {
  submit: ReturnType<typeof vi.fn>;
  mutate: ReturnType<typeof vi.fn>;
} {
  return {
    submit: vi.fn().mockResolvedValue(randomUUID() as import('@nous/shared').MemoryEntryId),
    mutate: vi.fn().mockResolvedValue({
      applied: true,
      reason: 'approved',
      reasonCode: 'MEM-COMPACT-STM-APPLIED',
    }),
  };
}

function mockProjectStore(): IProjectStore {
  return {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDocumentStore(): IDocumentStore {
  const store = new Map<string, unknown>();
  return {
    put: vi.fn().mockImplementation(async (_col: string, id: string, doc: unknown) => {
      store.set(id, doc);
    }),
    get: vi.fn().mockImplementation(async (_col: string, id: string) => {
      return store.get(id) ?? null;
    }),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function mockWitnessService(): IWitnessService {
  const makeEvent = () =>
    ({
      id: randomUUID() as import('@nous/shared').WitnessEventId,
    }) as import('@nous/shared').WitnessEvent;

  return {
    appendAuthorization: vi.fn().mockImplementation(async () => makeEvent()),
    appendCompletion: vi.fn().mockImplementation(async () => makeEvent()),
    appendInvariant: vi.fn().mockImplementation(async () => makeEvent()),
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

describe('CoreExecutor', () => {
  it('implements ICoreExecutor contract', () => {
    const provider = mockProvider('hi');
    const docStore = mockDocumentStore();
    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => provider,
      toolExecutor: mockToolExecutor(),
      stmStore: mockStmStore(),
      mwcPipeline: mockMwcPipeline(),
      projectStore: mockProjectStore(),
      documentStore: docStore,
      witnessService: mockWitnessService(),
      policyEngine,
    });
    expect(executor).toBeDefined();
    expect(typeof executor.executeTurn).toBe('function');
    expect(typeof executor.superviseProject).toBe('function');
    expect(typeof executor.getTrace).toBe('function');
  });

  it('executeTurn returns response and traceId', async () => {
    const provider = mockProvider('Hello from model');
    const docStore = mockDocumentStore();
    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => provider,
      toolExecutor: mockToolExecutor(),
      stmStore: mockStmStore(),
      mwcPipeline: mockMwcPipeline(),
      projectStore: mockProjectStore(),
      documentStore: docStore,
      witnessService: mockWitnessService(),
      policyEngine,
    });

    const result = await executor.executeTurn({
      message: 'test',
      traceId,
    });

    expect(result.response).toBe('Hello from model');
    expect(result.traceId).toBe(traceId);
  });

  it('includes STM summary in the model prompt', async () => {
    const provider = mockProvider('Hello from model');
    const docStore = mockDocumentStore();
    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => provider,
      toolExecutor: mockToolExecutor(),
      stmStore: mockStmStore(),
      mwcPipeline: mockMwcPipeline(),
      projectStore: mockProjectStore(),
      documentStore: docStore,
      witnessService: mockWitnessService(),
      policyEngine,
    });

    await executor.executeTurn({
      message: 'new question',
      traceId,
      stmContext: {
        entries: [],
        summary: 'Earlier summary',
        tokenCount: 4,
      },
    });

    expect(provider.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining('Summary: Earlier summary'),
        }),
      }),
    );
  });

  it('appends STM entries and triggers compaction through the MWC seam', async () => {
    const provider = mockProvider('Hello from model');
    const docStore = mockDocumentStore();
    const stmStore = mockStmStore();
    const mwcPipeline = mockMwcPipeline();
    const projectId = randomUUID() as import('@nous/shared').ProjectId;
    const getContext = stmStore.getContext as ReturnType<typeof vi.fn>;

    getContext
      .mockResolvedValueOnce({ entries: [], tokenCount: 0 })
      .mockResolvedValueOnce({
        entries: [
          {
            role: 'user',
            content: 'hi',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: 'hello',
            timestamp: new Date().toISOString(),
          },
        ],
        tokenCount: 24,
        compactionState: {
          requiresCompaction: true,
          trigger: 'token-threshold',
          currentTokenCount: 24,
          maxContextTokens: 12,
          targetContextTokens: 8,
        },
      });

    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => provider,
      toolExecutor: mockToolExecutor(),
      stmStore,
      mwcPipeline,
      projectStore: mockProjectStore(),
      documentStore: docStore,
      witnessService: mockWitnessService(),
      policyEngine,
    });

    await executor.executeTurn({
      message: 'test',
      projectId,
      traceId,
    });

    expect(stmStore.append).toHaveBeenCalledTimes(2);
    expect(stmStore.append).toHaveBeenNthCalledWith(
      1,
      projectId,
      expect.objectContaining({ role: 'user', content: 'test' }),
    );
    expect(stmStore.append).toHaveBeenNthCalledWith(
      2,
      projectId,
      expect.objectContaining({ role: 'assistant', content: 'Hello from model' }),
    );
    expect(mwcPipeline.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'compact-stm',
        actor: 'pfc',
        projectId,
      }),
    );
  });

  it('throws ValidationError for invalid TurnInput', async () => {
    const { ValidationError } = await import('@nous/shared');
    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => mockProvider(''),
      toolExecutor: mockToolExecutor(),
      stmStore: mockStmStore(),
      mwcPipeline: mockMwcPipeline(),
      projectStore: mockProjectStore(),
      documentStore: mockDocumentStore(),
      witnessService: mockWitnessService(),
      policyEngine,
    });

    await expect(
      executor.executeTurn({
        message: 'test',
        traceId: 'not-a-uuid' as never,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('superviseProject throws NOT_IMPLEMENTED', async () => {
    const { NousError } = await import('@nous/shared');
    const executor = new CoreExecutor({
      Cortex: mockPfc(),
      router: mockRouter(),
      getProvider: () => mockProvider(''),
      toolExecutor: mockToolExecutor(),
      stmStore: mockStmStore(),
      mwcPipeline: mockMwcPipeline(),
      projectStore: mockProjectStore(),
      documentStore: mockDocumentStore(),
      witnessService: mockWitnessService(),
      policyEngine,
    });

    await expect(
      executor.superviseProject(randomUUID() as import('@nous/shared').ProjectId),
    ).rejects.toThrow(NousError);
  });
});
