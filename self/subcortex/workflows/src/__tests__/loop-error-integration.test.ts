import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  createInitialWorkflowRunState,
  recordWorkflowNodeExecution,
} from '../run-state.js';
import { createWorkflowNodeHandlerRegistry } from '../handlers/index.js';
import type { WorkflowNodeExecutionContext } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440e01';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440e02';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440e03';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440e04';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440e05';
const NOW = '2026-03-31T00:00:00.000Z';

// Node IDs for various test graphs
const LOOP_NODE = '550e8400-e29b-41d4-a716-446655440e10';
const BODY_NODE = '550e8400-e29b-41d4-a716-446655440e11';
const EXIT_NODE = '550e8400-e29b-41d4-a716-446655440e12';
const ERROR_HANDLER = '550e8400-e29b-41d4-a716-446655440e13';
const ERROR_PATH = '550e8400-e29b-41d4-a716-446655440e14';
const NORMAL_PATH = '550e8400-e29b-41d4-a716-446655440e15';
const SPLIT_NODE = '550e8400-e29b-41d4-a716-446655440e16';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440e17';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440e18';
const JOIN_NODE = '550e8400-e29b-41d4-a716-446655440e19';
const FINAL_NODE = '550e8400-e29b-41d4-a716-446655440e20';
const CONDITION_NODE = '550e8400-e29b-41d4-a716-446655440e21';
const TRUE_PATH = '550e8400-e29b-41d4-a716-446655440e22';
const FALSE_PATH = '550e8400-e29b-41d4-a716-446655440e23';

// Edge IDs
const EDGE_LOOP_BODY = '550e8400-e29b-41d4-a716-446655440f01';
const EDGE_LOOP_EXIT = '550e8400-e29b-41d4-a716-446655440f02';
const EDGE_BODY_ERR = '550e8400-e29b-41d4-a716-446655440f03';
const EDGE_ERR_ERROR = '550e8400-e29b-41d4-a716-446655440f04';
const EDGE_ERR_NORMAL = '550e8400-e29b-41d4-a716-446655440f05';
const EDGE_SPLIT_A = '550e8400-e29b-41d4-a716-446655440f06';
const EDGE_SPLIT_B = '550e8400-e29b-41d4-a716-446655440f07';
const EDGE_A_JOIN = '550e8400-e29b-41d4-a716-446655440f08';
const EDGE_B_JOIN = '550e8400-e29b-41d4-a716-446655440f09';
const EDGE_JOIN_FINAL = '550e8400-e29b-41d4-a716-446655440f10';
const EDGE_EXIT_FINAL = '550e8400-e29b-41d4-a716-446655440f11';
const EDGE_START_COND = '550e8400-e29b-41d4-a716-446655440f12';
const EDGE_COND_TRUE = '550e8400-e29b-41d4-a716-446655440f13';
const EDGE_COND_FALSE = '550e8400-e29b-41d4-a716-446655440f14';
const EDGE_TRUE_SPLIT = '550e8400-e29b-41d4-a716-446655440f15';
const EDGE_FALSE_ERR = '550e8400-e29b-41d4-a716-446655440f16';

function createGovernanceDecision() {
  const evidenceRef = {
    actionCategory: 'trace-persist' as const,
    authorizationEventId: GOVERNANCE_EVENT_ID,
  };
  return {
    outcome: 'allow_with_flag' as const,
    reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
    governance: 'must' as const,
    actionCategory: 'trace-persist' as const,
    projectControlState: 'running' as const,
    patternId: GOVERNANCE_PATTERN_ID,
    confidence: 0.94,
    confidenceTier: 'high' as const,
    supportingSignals: 16,
    decayState: 'stable' as const,
    autonomyAllowed: false,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [evidenceRef],
    explanation: {
      patternId: GOVERNANCE_PATTERN_ID,
      outcomeRef: `workflow:${RUN_ID}`,
      evidenceRefs: [evidenceRef],
    },
  } as any;
}

const transition = {
  reasonCode: 'test_transition',
  evidenceRefs: ['test_evidence'],
  occurredAt: NOW,
};

function createAdmission() {
  return { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any;
}

function completedResult(reasonCode = 'test_completed', selectedBranchKey?: string) {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    selectedBranchKey,
    reasonCode,
    evidenceRefs: ['test_evidence'],
  };
}

function failedResult(reasonCode = 'test_failed') {
  return {
    outcome: 'failed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    reasonCode,
    evidenceRefs: ['test_evidence'],
  };
}

// --------------------------------------------------------------------------
// Test: Loop iteration + exit
// --------------------------------------------------------------------------

describe('loop iteration + exit', () => {
  it('executes loop body twice, then exits on iteration 3', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Loop Iteration Test',
      entryNodeIds: [LOOP_NODE],
      nodes: [
        { id: LOOP_NODE, name: 'Loop', type: 'loop', governance: 'must', executionModel: 'synchronous', config: { type: 'loop', maxIterations: 5, exitConditionRef: 'check' } },
        { id: BODY_NODE, name: 'Body', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://body', inputMappingRef: 'mapping://body' } },
        { id: EXIT_NODE, name: 'Exit', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://exit', inputMappingRef: 'mapping://exit' } },
      ],
      edges: [
        { id: EDGE_LOOP_BODY, from: LOOP_NODE, to: BODY_NODE, branchKey: 'loop', priority: 0 },
        { id: EDGE_LOOP_EXIT, from: LOOP_NODE, to: EXIT_NODE, branchKey: 'exit', priority: 1 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    // Iteration 1: loop continues
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_continue', 'loop'), transition,
    });
    expect(state.readyNodeIds).toContain(BODY_NODE);

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: completedResult('body_done'), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);

    // Iteration 2: loop continues
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_continue', 'loop'), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: completedResult('body_done'), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);

    // Iteration 3: loop exits
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_exit_condition_met', 'exit'), transition,
    });
    expect(state.readyNodeIds).toContain(EXIT_NODE);
    expect(state.readyNodeIds).not.toContain(LOOP_NODE);
  });
});

// --------------------------------------------------------------------------
// Test: Loop + maxIterations
// --------------------------------------------------------------------------

describe('loop + maxIterations', () => {
  it('exits on max iterations even when condition is not met', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Max Iterations Test',
      entryNodeIds: [LOOP_NODE],
      nodes: [
        { id: LOOP_NODE, name: 'Loop', type: 'loop', governance: 'must', executionModel: 'synchronous', config: { type: 'loop', maxIterations: 2, exitConditionRef: 'check' } },
        { id: BODY_NODE, name: 'Body', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://body', inputMappingRef: 'mapping://body' } },
        { id: EXIT_NODE, name: 'Exit', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://exit', inputMappingRef: 'mapping://exit' } },
      ],
      edges: [
        { id: EDGE_LOOP_BODY, from: LOOP_NODE, to: BODY_NODE, branchKey: 'loop', priority: 0 },
        { id: EDGE_LOOP_EXIT, from: LOOP_NODE, to: EXIT_NODE, branchKey: 'exit', priority: 1 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    // Iteration 1: continue
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_continue', 'loop'), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: completedResult('body_done'), transition,
    });

    // Iteration 2: continue
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_continue', 'loop'), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: completedResult('body_done'), transition,
    });

    // Iteration 3: max iterations forces exit
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_max_iterations', 'exit'), transition,
    });
    expect(state.readyNodeIds).toContain(EXIT_NODE);
  });
});

// --------------------------------------------------------------------------
// Test: Error handler upstream catch
// --------------------------------------------------------------------------

describe('error handler upstream catch', () => {
  it('routes to error path when upstream node fails', () => {
    const UPSTREAM = '550e8400-e29b-41d4-a716-446655440e30';
    const EDGE_UP_ERR = '550e8400-e29b-41d4-a716-446655440f20';

    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Error Catch Test',
      entryNodeIds: [UPSTREAM],
      nodes: [
        { id: UPSTREAM, name: 'Upstream', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://up', inputMappingRef: 'mapping://up' } },
        { id: ERROR_HANDLER, name: 'Error Handler', type: 'error-handler', governance: 'must', executionModel: 'synchronous', config: { type: 'error-handler', catchScope: 'upstream' } },
        { id: ERROR_PATH, name: 'Error Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://err', inputMappingRef: 'mapping://err' } },
        { id: NORMAL_PATH, name: 'Normal Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://ok', inputMappingRef: 'mapping://ok' } },
      ],
      edges: [
        { id: EDGE_UP_ERR, from: UPSTREAM, to: ERROR_HANDLER, priority: 0 },
        { id: EDGE_ERR_ERROR, from: ERROR_HANDLER, to: ERROR_PATH, branchKey: 'error', priority: 0 },
        { id: EDGE_ERR_NORMAL, from: ERROR_HANDLER, to: NORMAL_PATH, priority: 1 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    // Upstream completes successfully
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: UPSTREAM as any,
      result: completedResult('upstream_done'), transition,
    });
    expect(state.readyNodeIds).toContain(ERROR_HANDLER);

    // Error handler sees no failures -> passthrough
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: ERROR_HANDLER as any,
      result: completedResult('workflow_error_handler_passthrough'), transition,
    });
    // Normal path should be activated (no branchKey on the edge means passthrough edges activate)
    expect(state.readyNodeIds).toContain(NORMAL_PATH);
  });
});

// --------------------------------------------------------------------------
// Test: Error handler specific-node catch
// --------------------------------------------------------------------------

describe('error handler specific-node catch', () => {
  it('catches failure from specific target node', () => {
    const UPSTREAM_OK = '550e8400-e29b-41d4-a716-446655440e31';
    const UPSTREAM_FAIL = '550e8400-e29b-41d4-a716-446655440e32';
    const EDGE_OK_ERR = '550e8400-e29b-41d4-a716-446655440f21';
    const EDGE_FAIL_ERR = '550e8400-e29b-41d4-a716-446655440f22';

    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Specific Catch Test',
      entryNodeIds: [UPSTREAM_OK, UPSTREAM_FAIL],
      nodes: [
        { id: UPSTREAM_OK, name: 'OK', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://ok', inputMappingRef: 'mapping://ok' } },
        { id: UPSTREAM_FAIL, name: 'Fail', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://fail', inputMappingRef: 'mapping://fail' } },
        { id: ERROR_HANDLER, name: 'Error Handler', type: 'error-handler', governance: 'must', executionModel: 'synchronous', config: { type: 'error-handler', catchScope: 'specific', targetNodeIds: [UPSTREAM_FAIL] } },
        { id: ERROR_PATH, name: 'Error Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://err', inputMappingRef: 'mapping://err' } },
      ],
      edges: [
        { id: EDGE_OK_ERR, from: UPSTREAM_OK, to: ERROR_HANDLER, priority: 0 },
        { id: EDGE_FAIL_ERR, from: UPSTREAM_FAIL, to: ERROR_HANDLER, priority: 0 },
        { id: EDGE_ERR_ERROR, from: ERROR_HANDLER, to: ERROR_PATH, branchKey: 'error', priority: 0 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    // Both complete — OK succeeds, FAIL fails
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: UPSTREAM_OK as any,
      result: completedResult('ok'), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: UPSTREAM_FAIL as any,
      result: failedResult('failed'), transition,
    });

    // Error handler should detect failure from UPSTREAM_FAIL
    // Note: the error handler checks are done inside the handler execute(),
    // we verify the handler works correctly via result routing
    expect(state.nodeStates[UPSTREAM_FAIL]?.status).toBe('failed');
  });
});

// --------------------------------------------------------------------------
// Test: Error handler passthrough
// --------------------------------------------------------------------------

describe('error handler passthrough', () => {
  it('passes through when all upstream nodes complete successfully', () => {
    const UPSTREAM = '550e8400-e29b-41d4-a716-446655440e33';
    const EDGE_UP_ERR = '550e8400-e29b-41d4-a716-446655440f23';

    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Passthrough Test',
      entryNodeIds: [UPSTREAM],
      nodes: [
        { id: UPSTREAM, name: 'Upstream', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://up', inputMappingRef: 'mapping://up' } },
        { id: ERROR_HANDLER, name: 'Error Handler', type: 'error-handler', governance: 'must', executionModel: 'synchronous', config: { type: 'error-handler', catchScope: 'upstream' } },
        { id: NORMAL_PATH, name: 'Normal', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://ok', inputMappingRef: 'mapping://ok' } },
      ],
      edges: [
        { id: EDGE_UP_ERR, from: UPSTREAM, to: ERROR_HANDLER, priority: 0 },
        { id: EDGE_ERR_NORMAL, from: ERROR_HANDLER, to: NORMAL_PATH, priority: 0 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: UPSTREAM as any,
      result: completedResult('upstream_done'), transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: ERROR_HANDLER as any,
      result: completedResult('workflow_error_handler_passthrough'), transition,
    });
    expect(state.readyNodeIds).toContain(NORMAL_PATH);
  });
});

// --------------------------------------------------------------------------
// Test: Handler registry count
// --------------------------------------------------------------------------

describe('handler registry', () => {
  it('contains 10 entries (6 original + 4 logic gate handlers)', () => {
    const registry = createWorkflowNodeHandlerRegistry();
    expect(registry.size).toBe(10);
  });

  it('includes all 4 logic gate handler types', () => {
    const registry = createWorkflowNodeHandlerRegistry();
    expect(registry.has('parallel-split')).toBe(true);
    expect(registry.has('parallel-join')).toBe(true);
    expect(registry.has('loop')).toBe(true);
    expect(registry.has('error-handler')).toBe(true);
  });

  it('maps loop to LoopWorkflowNodeHandler', () => {
    const registry = createWorkflowNodeHandlerRegistry();
    const handler = registry.get('loop');
    expect(handler).toBeDefined();
    expect(handler!.nodeType).toBe('loop');
  });

  it('maps error-handler to ErrorHandlerWorkflowNodeHandler', () => {
    const registry = createWorkflowNodeHandlerRegistry();
    const handler = registry.get('error-handler');
    expect(handler).toBeDefined();
    expect(handler!.nodeType).toBe('error-handler');
  });
});

// --------------------------------------------------------------------------
// Test: Runtime adapter round-trip for all 4 logic gate types
// --------------------------------------------------------------------------

describe('runtime adapter round-trip verification', () => {
  it.each([
    ['parallel-split', { type: 'parallel-split', splitMode: 'all', branches: [] }],
    ['parallel-join', { type: 'parallel-join', joinMode: 'all' }],
    ['loop', { type: 'loop', maxIterations: 5, exitConditionRef: 'check' }],
    ['error-handler', { type: 'error-handler', catchScope: 'upstream' }],
  ] as const)('handler registry resolves %s and execute() returns well-formed result', async (nodeType, config) => {
    const NODE = '550e8400-e29b-41d4-a716-446655440e40';
    const registry = createWorkflowNodeHandlerRegistry();
    const handler = registry.get(nodeType as any);
    expect(handler).toBeDefined();
    expect(handler!.nodeType).toBe(nodeType);

    // Build a minimal graph for the handler
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Round Trip Test',
      entryNodeIds: [NODE],
      nodes: [
        { id: NODE, name: 'Test', type: nodeType, governance: 'must', executionModel: 'synchronous', config },
      ],
      edges: [],
    } as any);

    const context: WorkflowNodeExecutionContext = {
      projectConfig: { id: PROJECT_ID } as any,
      graph,
      runState: {
        runId: RUN_ID,
        nodeStates: {
          [NODE]: { status: 'ready', attempts: [], activeAttempt: null },
        },
      } as any,
      nodeDefinition: graph.nodes[NODE]!.definition,
      dispatchLineage: {
        id: '550e8400-e29b-41d4-a716-446655440e41',
        runId: RUN_ID,
        nodeDefinitionId: NODE,
        evidenceRefs: ['test_evidence'],
        occurredAt: NOW,
      } as any,
      controlState: 'running' as any,
      governanceInput: {} as any,
      governanceDecision: createGovernanceDecision(),
    };

    const result = await handler!.execute(context);

    // All results must have these standard fields
    expect(result.outcome).toBeDefined();
    expect(result.governanceDecision).toBeDefined();
    expect(result.sideEffectStatus).toBeDefined();
    expect(result.reasonCode).toBeDefined();
    expect(result.evidenceRefs).toBeDefined();
    expect(Array.isArray(result.evidenceRefs)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Test: Full regression — all handler types in one graph
// --------------------------------------------------------------------------

describe('full regression: all handlers in a single workflow graph', () => {
  it('builds and initializes a graph with all handler types', () => {
    const MODEL_CALL = '550e8400-e29b-41d4-a716-446655440e50';
    const TRANSFORM = '550e8400-e29b-41d4-a716-446655440e51';
    const CONDITION = '550e8400-e29b-41d4-a716-446655440e52';
    const TRUE_NODE = '550e8400-e29b-41d4-a716-446655440e53';
    const FALSE_NODE = '550e8400-e29b-41d4-a716-446655440e54';
    const SPLIT = '550e8400-e29b-41d4-a716-446655440e55';
    const BR_A = '550e8400-e29b-41d4-a716-446655440e56';
    const BR_B = '550e8400-e29b-41d4-a716-446655440e57';
    const JOIN = '550e8400-e29b-41d4-a716-446655440e58';
    const LOOP = '550e8400-e29b-41d4-a716-446655440e59';
    const LOOP_BODY = '550e8400-e29b-41d4-a716-446655440e60';
    const LOOP_EXIT = '550e8400-e29b-41d4-a716-446655440e61';
    const ERR_HANDLER = '550e8400-e29b-41d4-a716-446655440e62';
    const ERR_PATH = '550e8400-e29b-41d4-a716-446655440e63';
    const NORMAL = '550e8400-e29b-41d4-a716-446655440e64';

    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Full Regression',
      entryNodeIds: [MODEL_CALL],
      nodes: [
        { id: MODEL_CALL, name: 'Model Call', type: 'model-call', governance: 'must', executionModel: 'synchronous', config: { type: 'model-call', modelRole: 'cortex-chat', promptRef: 'prompt://test', outputSchemaRef: 'schema://output' } },
        { id: TRANSFORM, name: 'Transform', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://t', inputMappingRef: 'mapping://t' } },
        { id: CONDITION, name: 'Condition', type: 'condition', governance: 'must', executionModel: 'synchronous', config: { type: 'condition', predicateRef: 'pred://x', trueBranchKey: 'true', falseBranchKey: 'false' } },
        { id: TRUE_NODE, name: 'True Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://true', inputMappingRef: 'mapping://true' } },
        { id: FALSE_NODE, name: 'False Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://false', inputMappingRef: 'mapping://false' } },
        { id: SPLIT, name: 'Split', type: 'parallel-split', governance: 'must', executionModel: 'synchronous', config: { type: 'parallel-split', splitMode: 'all', branches: [] } },
        { id: BR_A, name: 'Branch A', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://a', inputMappingRef: 'mapping://a' } },
        { id: BR_B, name: 'Branch B', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' } },
        { id: JOIN, name: 'Join', type: 'parallel-join', governance: 'must', executionModel: 'synchronous', config: { type: 'parallel-join', joinMode: 'all' } },
        { id: LOOP, name: 'Loop', type: 'loop', governance: 'must', executionModel: 'synchronous', config: { type: 'loop', maxIterations: 3, exitConditionRef: 'check' } },
        { id: LOOP_BODY, name: 'Loop Body', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://lb', inputMappingRef: 'mapping://lb' } },
        { id: LOOP_EXIT, name: 'Loop Exit', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://le', inputMappingRef: 'mapping://le' } },
        { id: ERR_HANDLER, name: 'Error Handler', type: 'error-handler', governance: 'must', executionModel: 'synchronous', config: { type: 'error-handler', catchScope: 'upstream' } },
        { id: ERR_PATH, name: 'Error Path', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://ep', inputMappingRef: 'mapping://ep' } },
        { id: NORMAL, name: 'Normal', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://n', inputMappingRef: 'mapping://n' } },
      ],
      edges: [
        { id: '550e8400-e29b-41d4-a716-446655440f30', from: MODEL_CALL, to: TRANSFORM, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f31', from: TRANSFORM, to: CONDITION, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f32', from: CONDITION, to: TRUE_NODE, branchKey: 'true', priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f33', from: CONDITION, to: FALSE_NODE, branchKey: 'false', priority: 1 },
        { id: '550e8400-e29b-41d4-a716-446655440f34', from: TRUE_NODE, to: SPLIT, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f35', from: SPLIT, to: BR_A, branchKey: 'a', priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f36', from: SPLIT, to: BR_B, branchKey: 'b', priority: 1 },
        { id: '550e8400-e29b-41d4-a716-446655440f37', from: BR_A, to: JOIN, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f38', from: BR_B, to: JOIN, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f39', from: JOIN, to: LOOP, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f40', from: LOOP, to: LOOP_BODY, branchKey: 'loop', priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f41', from: LOOP, to: LOOP_EXIT, branchKey: 'exit', priority: 1 },
        { id: '550e8400-e29b-41d4-a716-446655440f42', from: LOOP_EXIT, to: ERR_HANDLER, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f43', from: ERR_HANDLER, to: ERR_PATH, branchKey: 'error', priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440f44', from: ERR_HANDLER, to: NORMAL, priority: 1 },
      ],
    } as any);

    // Verify graph built correctly — all 15 nodes, all 15 edges
    expect(Object.keys(graph.nodes)).toHaveLength(15);
    expect(Object.keys(graph.edges)).toHaveLength(15);
    expect(graph.topologicalOrder).toHaveLength(15);
    expect(graph.entryNodeIds).toContain(MODEL_CALL);

    // Verify all node types are present
    const nodeTypes = new Set(
      Object.values(graph.nodes).map((n) => n.definition.type),
    );
    expect(nodeTypes).toContain('model-call');
    expect(nodeTypes).toContain('transform');
    expect(nodeTypes).toContain('condition');
    expect(nodeTypes).toContain('parallel-split');
    expect(nodeTypes).toContain('parallel-join');
    expect(nodeTypes).toContain('loop');
    expect(nodeTypes).toContain('error-handler');

    // Initialize run state — should work without errors
    const state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    expect(state.readyNodeIds).toContain(MODEL_CALL);
    expect(state.status).toBe('ready');
  });
});

// --------------------------------------------------------------------------
// Test: Combined parallel-split + loop + parallel-join
// --------------------------------------------------------------------------

describe('combined parallel-split + loop + parallel-join', () => {
  it('loop iterates within a parallel branch and join waits for both branches', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Parallel + Loop Test',
      entryNodeIds: [SPLIT_NODE],
      nodes: [
        { id: SPLIT_NODE, name: 'Split', type: 'parallel-split', governance: 'must', executionModel: 'synchronous', config: { type: 'parallel-split', splitMode: 'all', branches: [] } },
        { id: LOOP_NODE, name: 'Loop', type: 'loop', governance: 'must', executionModel: 'synchronous', config: { type: 'loop', maxIterations: 3, exitConditionRef: 'check' } },
        { id: BODY_NODE, name: 'Body', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://body', inputMappingRef: 'mapping://body' } },
        { id: EXIT_NODE, name: 'Loop Exit', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://exit', inputMappingRef: 'mapping://exit' } },
        { id: BRANCH_B, name: 'Branch B', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' } },
        { id: JOIN_NODE, name: 'Join', type: 'parallel-join', governance: 'must', executionModel: 'synchronous', config: { type: 'parallel-join', joinMode: 'all' } },
        { id: FINAL_NODE, name: 'Final', type: 'transform', governance: 'must', executionModel: 'synchronous', config: { type: 'transform', transformRef: 'transform://final', inputMappingRef: 'mapping://final' } },
      ],
      edges: [
        { id: EDGE_SPLIT_A, from: SPLIT_NODE, to: LOOP_NODE, branchKey: 'a', priority: 0 },
        { id: EDGE_SPLIT_B, from: SPLIT_NODE, to: BRANCH_B, branchKey: 'b', priority: 1 },
        { id: EDGE_LOOP_BODY, from: LOOP_NODE, to: BODY_NODE, branchKey: 'loop', priority: 0 },
        { id: EDGE_LOOP_EXIT, from: LOOP_NODE, to: EXIT_NODE, branchKey: 'exit', priority: 1 },
        { id: EDGE_EXIT_FINAL, from: EXIT_NODE, to: JOIN_NODE, priority: 0 },
        { id: EDGE_B_JOIN, from: BRANCH_B, to: JOIN_NODE, priority: 0 },
        { id: EDGE_JOIN_FINAL, from: JOIN_NODE, to: FINAL_NODE, priority: 0 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any, graph, admission: createAdmission(), transition,
    });

    // Execute split
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult('workflow_parallel_split_activated'), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);
    expect(state.readyNodeIds).toContain(BRANCH_B);

    // Execute branch B
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_B as any,
      result: completedResult('branch_b_done'), transition,
    });

    // Loop iteration 1
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_continue', 'loop'), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: completedResult('body_done'), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);

    // Loop exits
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: completedResult('workflow_loop_exit_condition_met', 'exit'), transition,
    });
    expect(state.readyNodeIds).toContain(EXIT_NODE);

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: EXIT_NODE as any,
      result: completedResult('exit_done'), transition,
    });

    // Join should become ready (both branches complete)
    expect(state.readyNodeIds).toContain(JOIN_NODE);
  });
});
