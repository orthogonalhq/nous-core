import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowDispatchHarness } from '../workflow-dispatch-harness.js';
import type {
  WorkflowDispatchHarnessConfig,
  HarnessRunInput,
} from '../workflow-dispatch-harness.js';
import type {
  AgentResult,
  DerivedWorkflowGraph,
  IWorkflowEngine,
  WorkflowRunState,
  WorkflowNodeDefinitionId,
} from '@nous/shared';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const RUN_ID = '550e8400-e29b-41d4-a716-446655440001' as WorkflowRunState['runId'];
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const WORKFLOW_DEF_ID = '550e8400-e29b-41d4-a716-446655440003';
const NODE_A = '550e8400-e29b-41d4-a716-446655440010' as WorkflowNodeDefinitionId;
const NODE_B = '550e8400-e29b-41d4-a716-446655440011' as WorkflowNodeDefinitionId;
const NODE_C = '550e8400-e29b-41d4-a716-446655440012' as WorkflowNodeDefinitionId;
const NODE_D = '550e8400-e29b-41d4-a716-446655440013' as WorkflowNodeDefinitionId;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraph(nodes: Record<string, { type: string; name: string }>): DerivedWorkflowGraph {
  const graphNodes: Record<string, any> = {};
  for (const [id, { type, name }] of Object.entries(nodes)) {
    graphNodes[id] = {
      definition: {
        id,
        name,
        type,
        governance: 'must',
        executionModel: 'synchronous',
        config: { type },
      },
      inEdges: [],
      outEdges: [],
    };
  }
  return {
    definitionId: WORKFLOW_DEF_ID as any,
    digest: 'a'.repeat(64),
    entryNodeIds: [Object.keys(nodes)[0]!] as any[],
    nodes: graphNodes,
    edges: {},
    topologicalOrder: Object.keys(nodes) as any[],
  } as unknown as DerivedWorkflowGraph;
}

function makeRunState(overrides: Partial<WorkflowRunState> = {}): WorkflowRunState {
  return {
    runId: RUN_ID,
    workflowDefinitionId: WORKFLOW_DEF_ID,
    projectId: PROJECT_ID,
    workflowVersion: '1.0.0',
    graphDigest: 'a'.repeat(64),
    status: 'running',
    admission: { outcome: 'allow', reasonCode: 'admitted', evidenceRefs: [] },
    readyNodeIds: [],
    activeNodeIds: [],
    waitingNodeIds: [],
    blockedNodeIds: [],
    completedNodeIds: [],
    activatedEdgeIds: [],
    evidenceRefs: [],
    checkpointState: 'idle',
    nodeStates: {},
    dispatchLineage: [],
    startedAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
    ...overrides,
  } as unknown as WorkflowRunState;
}

function makeCompletedAgentResult(usage?: { tokensUsed: number }): AgentResult {
  return {
    status: 'completed',
    output: { result: 'ok' },
    usage: usage ?? { turnsUsed: 1, tokensUsed: 100, elapsedMs: 500, spawnUnitsUsed: 0 },
    summary: 'done',
  } as AgentResult;
}

function makeFailedAgentResult(status: 'escalated' | 'aborted' | 'budget_exhausted' | 'error'): AgentResult {
  return {
    status,
    reason: `${status} reason`,
    usage: { turnsUsed: 1, tokensUsed: 50, elapsedMs: 200, spawnUnitsUsed: 0 },
  } as AgentResult;
}

function makeSuspendedAgentResult(): AgentResult {
  return {
    status: 'suspended',
    reason: 'waiting for input',
    usage: { turnsUsed: 1, tokensUsed: 30, elapsedMs: 100, spawnUnitsUsed: 0 },
  } as AgentResult;
}

const LIFECYCLE_CONTEXT = {
  agentId: 'test-agent',
  agentClass: 'Orchestrator',
  correlation: { traceId: 'trace-1', spanId: 'span-1' },
  usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
  snapshot: {
    agentId: 'test-agent',
    agentClass: 'Orchestrator',
    correlation: { traceId: 'trace-1', spanId: 'span-1' },
    budget: { maxTurns: 100, maxTokens: 100000, maxTimeoutMs: 300000, spawnBudgetCeiling: 6 },
    usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
    startedAt: '2026-03-31T00:00:00.000Z',
    lastUpdatedAt: '2026-03-31T00:00:00.000Z',
    contextFrameCount: 0,
  },
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowDispatchHarness', () => {
  let mockEngine: IWorkflowEngine;
  let mockDispatchWorker: ReturnType<typeof vi.fn>;
  let mockDispatchOrchestrator: ReturnType<typeof vi.fn>;
  let mockObserver: { event: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockEngine = {
      executeReadyNode: vi.fn(),
      completeNode: vi.fn(),
      getState: vi.fn(),
      resolveDefinition: vi.fn(),
      resolveDefinitionSource: vi.fn(),
      deriveGraph: vi.fn(),
      evaluateAdmission: vi.fn(),
      start: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      continueNode: vi.fn(),
      listProjectRuns: vi.fn(),
      getRunGraph: vi.fn(),
    };
    mockDispatchWorker = vi.fn();
    mockDispatchOrchestrator = vi.fn();
    mockObserver = { event: vi.fn() };
  });

  function createHarness(overrides?: Partial<WorkflowDispatchHarnessConfig>) {
    return new WorkflowDispatchHarness({
      engine: mockEngine,
      dispatchWorker: mockDispatchWorker,
      dispatchOrchestrator: mockDispatchOrchestrator,
      observer: mockObserver,
      ...overrides,
    });
  }

  function createInput(overrides?: Partial<HarnessRunInput>): HarnessRunInput {
    return {
      runId: RUN_ID,
      graph: makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } }),
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
      lifecycleContext: LIFECYCLE_CONTEXT,
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Single internal node
  // -------------------------------------------------------------------------

  it('executes a single internal node (condition) via engine', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'condition', name: 'Check' } });
    const stateAfterExec = makeRunState({ readyNodeIds: [], completedNodeIds: [NODE_A], status: 'completed' });

    vi.mocked(mockEngine.executeReadyNode).mockResolvedValueOnce(stateAfterExec);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterExec);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('completed');
    expect(result.nodeResults.get(NODE_A)?.executionMode).toBe('internal');
    expect(mockEngine.executeReadyNode).toHaveBeenCalledOnce();
    expect(mockDispatchWorker).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Single dispatched node (model-call)
  // -------------------------------------------------------------------------

  it('dispatches a single Worker for a model-call node', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } });
    const stateAfterComplete = makeRunState({ readyNodeIds: [], completedNodeIds: [NODE_A], status: 'completed' });

    mockDispatchWorker.mockResolvedValueOnce(makeCompletedAgentResult());
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterComplete);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterComplete);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('completed');
    expect(result.nodeResults.get(NODE_A)?.executionMode).toBe('dispatched');
    expect(result.nodeResults.get(NODE_A)?.agentResult?.status).toBe('completed');
    expect(mockDispatchWorker).toHaveBeenCalledOnce();
    expect(result.suspended).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Mixed workflow (condition -> model-call)
  // -------------------------------------------------------------------------

  it('handles mixed workflow with correct execution order', async () => {
    const graph = makeGraph({
      [NODE_A]: { type: 'condition', name: 'Check' },
      [NODE_B]: { type: 'model-call', name: 'Draft' },
    });

    // After internal execution of condition, model-call becomes ready
    const stateAfterCondition = makeRunState({ readyNodeIds: [NODE_B], completedNodeIds: [NODE_A] });
    const stateAfterDraft = makeRunState({ readyNodeIds: [], completedNodeIds: [NODE_A, NODE_B], status: 'completed' });

    vi.mocked(mockEngine.executeReadyNode).mockResolvedValueOnce(stateAfterCondition);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterCondition);
    mockDispatchWorker.mockResolvedValueOnce(makeCompletedAgentResult());
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterDraft);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterDraft);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('completed');
    expect(result.nodeResults.size).toBe(2);
    expect(result.nodeResults.get(NODE_A)?.executionMode).toBe('internal');
    expect(result.nodeResults.get(NODE_B)?.executionMode).toBe('dispatched');
  });

  // -------------------------------------------------------------------------
  // Parallel dispatch bounded by concurrency limit
  // -------------------------------------------------------------------------

  it('dispatches multiple ready nodes in parallel bounded by limit', async () => {
    const graph = makeGraph({
      [NODE_A]: { type: 'model-call', name: 'A' },
      [NODE_B]: { type: 'model-call', name: 'B' },
      [NODE_C]: { type: 'model-call', name: 'C' },
    });

    const stateAfterAll = makeRunState({
      readyNodeIds: [],
      completedNodeIds: [NODE_A, NODE_B, NODE_C],
      status: 'completed',
    });

    mockDispatchWorker.mockResolvedValue(makeCompletedAgentResult());
    vi.mocked(mockEngine.completeNode).mockResolvedValue(stateAfterAll);
    vi.mocked(mockEngine.getState).mockResolvedValue(stateAfterAll);

    const harness = createHarness({ concurrencyLimit: 2 });
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A, NODE_B, NODE_C] }),
    }));

    expect(mockDispatchWorker).toHaveBeenCalledTimes(3);
    expect(result.finalRunState.status).toBe('completed');
  });

  // -------------------------------------------------------------------------
  // Worker failure with error edge (node fails, workflow may continue)
  // -------------------------------------------------------------------------

  it('maps Worker failure to node failed and calls completeNode', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } });
    const stateAfterFail = makeRunState({ readyNodeIds: [], status: 'failed' });

    mockDispatchWorker.mockResolvedValueOnce(makeFailedAgentResult('error'));
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterFail);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterFail);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('failed');
    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: 'agent_error' }),
    );
  });

  // -------------------------------------------------------------------------
  // Worker failure without error edge — workflow fails
  // -------------------------------------------------------------------------

  it('workflow fails when Worker returns escalated status', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'tool-execution', name: 'Run' } });
    const stateAfterFail = makeRunState({ readyNodeIds: [], status: 'failed' });

    mockDispatchWorker.mockResolvedValueOnce(makeFailedAgentResult('escalated'));
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterFail);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterFail);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('failed');
    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: 'agent_escalated' }),
    );
  });

  // -------------------------------------------------------------------------
  // AgentResult.status exhaustive mapping
  // -------------------------------------------------------------------------

  it.each([
    ['completed', 'node_completed_by_agent'],
    ['escalated', 'agent_escalated'],
    ['aborted', 'agent_aborted'],
    ['budget_exhausted', 'agent_budget_exhausted'],
    ['error', 'agent_error'],
  ] as const)('maps AgentResult.status=%s to reasonCode=%s', async (status, expectedReasonCode) => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } });
    const finalState = makeRunState({ readyNodeIds: [], status: status === 'completed' ? 'completed' : 'failed' });

    const agentResult = status === 'completed'
      ? makeCompletedAgentResult()
      : makeFailedAgentResult(status as any);

    mockDispatchWorker.mockResolvedValueOnce(agentResult);
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(finalState);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(finalState);

    const harness = createHarness();
    await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: expectedReasonCode }),
    );
  });

  // -------------------------------------------------------------------------
  // Human-decision node — harness suspends
  // -------------------------------------------------------------------------

  it('suspends for human-decision nodes with waiting_review', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'human-decision', name: 'Approve' } });

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.suspended).toBe(true);
    expect(mockDispatchWorker).not.toHaveBeenCalled();
    expect(mockDispatchOrchestrator).not.toHaveBeenCalled();
    expect(mockEngine.executeReadyNode).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Subworkflow node — dispatches Orchestrator with skill intent
  // -------------------------------------------------------------------------

  it('dispatches Orchestrator for subworkflow nodes with skill intent', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'subworkflow', name: 'child-workflow' } });
    const stateAfterComplete = makeRunState({ readyNodeIds: [], completedNodeIds: [NODE_A], status: 'completed' });

    mockDispatchOrchestrator.mockResolvedValueOnce(makeCompletedAgentResult());
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterComplete);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterComplete);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(mockDispatchOrchestrator).toHaveBeenCalledOnce();
    expect(mockDispatchOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchIntent: expect.objectContaining({ type: 'skill', skillRef: 'child-workflow' }),
      }),
      expect.anything(),
    );
    expect(result.finalRunState.status).toBe('completed');
    expect(mockDispatchWorker).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Token usage accumulation
  // -------------------------------------------------------------------------

  it('accumulates token usage from dispatched nodes', async () => {
    const graph = makeGraph({
      [NODE_A]: { type: 'model-call', name: 'A' },
      [NODE_B]: { type: 'model-call', name: 'B' },
    });
    const finalState = makeRunState({
      readyNodeIds: [],
      completedNodeIds: [NODE_A, NODE_B],
      status: 'completed',
    });

    mockDispatchWorker
      .mockResolvedValueOnce(makeCompletedAgentResult({ tokensUsed: 200 }))
      .mockResolvedValueOnce(makeCompletedAgentResult({ tokensUsed: 300 }));
    vi.mocked(mockEngine.completeNode).mockResolvedValue(finalState);
    vi.mocked(mockEngine.getState).mockResolvedValue(finalState);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A, NODE_B] }),
    }));

    expect(result.totalUsage.totalTokens).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Observer events
  // -------------------------------------------------------------------------

  it('emits observer events at correct lifecycle points', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } });
    const stateAfterComplete = makeRunState({ readyNodeIds: [], completedNodeIds: [NODE_A], status: 'completed' });

    mockDispatchWorker.mockResolvedValueOnce(makeCompletedAgentResult());
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterComplete);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterComplete);

    const harness = createHarness();
    await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    const eventNames = mockObserver.event.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(eventNames).toContain('harness:node_dispatched');
    expect(eventNames).toContain('harness:node_completed');
    expect(eventNames).toContain('harness:run_completed');
  });

  // -------------------------------------------------------------------------
  // Dispatch exception — maps to node failure
  // -------------------------------------------------------------------------

  it('handles dispatch exception by failing the node', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'Draft' } });
    const stateAfterFail = makeRunState({ readyNodeIds: [], status: 'failed' });

    mockDispatchWorker.mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterFail);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterFail);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('failed');
    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: 'dispatch_exception' }),
    );
  });

  // -------------------------------------------------------------------------
  // Max node attempts exceeded
  // -------------------------------------------------------------------------

  it('fails node when max attempts exceeded', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'condition', name: 'Loop' } });

    // Simulate the node being ready again after internal execution (loop)
    const stateStillReady = makeRunState({ readyNodeIds: [NODE_A] });
    const stateFailed = makeRunState({ readyNodeIds: [], status: 'failed' });

    // First 3 attempts: engine returns state with NODE_A still ready
    vi.mocked(mockEngine.executeReadyNode)
      .mockResolvedValueOnce(stateStillReady)
      .mockResolvedValueOnce(stateStillReady)
      .mockResolvedValueOnce(stateStillReady);
    vi.mocked(mockEngine.getState)
      .mockResolvedValueOnce(stateStillReady)
      .mockResolvedValueOnce(stateStillReady)
      .mockResolvedValueOnce(stateStillReady);

    // Fourth attempt triggers max attempts exceeded, completeNode called with fail
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateFailed);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateFailed);

    const harness = createHarness({ maxNodeAttempts: 3 });
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('failed');
    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: 'max_node_attempts_exceeded' }),
    );
  });

  // -------------------------------------------------------------------------
  // No ready nodes — returns immediately
  // -------------------------------------------------------------------------

  it('returns immediately when no ready nodes', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'model-call', name: 'A' } });
    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [], status: 'completed' }),
    }));

    expect(result.finalRunState.status).toBe('completed');
    expect(result.nodeResults.size).toBe(0);
    expect(mockDispatchWorker).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Internal node engine error
  // -------------------------------------------------------------------------

  it('handles engine execution error for internal nodes', async () => {
    const graph = makeGraph({ [NODE_A]: { type: 'transform', name: 'Transform' } });
    const stateAfterFail = makeRunState({ readyNodeIds: [], status: 'failed' });

    vi.mocked(mockEngine.executeReadyNode).mockRejectedValueOnce(new Error('PFC denied'));
    vi.mocked(mockEngine.completeNode).mockResolvedValueOnce(stateAfterFail);
    vi.mocked(mockEngine.getState).mockResolvedValueOnce(stateAfterFail);

    const harness = createHarness();
    const result = await harness.run(createInput({
      graph,
      initialRunState: makeRunState({ readyNodeIds: [NODE_A] }),
    }));

    expect(result.finalRunState.status).toBe('failed');
    expect(vi.mocked(mockEngine.completeNode)).toHaveBeenCalledWith(
      RUN_ID,
      NODE_A,
      expect.objectContaining({ reasonCode: 'engine_execution_error' }),
    );
  });
});
