import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../../graph-builder.js';
import { LoopWorkflowNodeHandler } from '../loop-handler.js';
import type { WorkflowNodeExecutionContext, WorkflowNodeExecutionPayload } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440a01';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440a02';
const LOOP_NODE = '550e8400-e29b-41d4-a716-446655440a03';
const BODY_NODE = '550e8400-e29b-41d4-a716-446655440a04';
const EXIT_NODE = '550e8400-e29b-41d4-a716-446655440a05';
const EDGE_LOOP_BODY = '550e8400-e29b-41d4-a716-446655440a06';
const EDGE_LOOP_EXIT = '550e8400-e29b-41d4-a716-446655440a07';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440a08';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440a09';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440a10';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440a11';

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

function buildLoopGraph(maxIterations = 5, backoffMs?: number) {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Loop Test',
    entryNodeIds: [LOOP_NODE],
    nodes: [
      {
        id: LOOP_NODE,
        name: 'Loop',
        type: 'loop',
        governance: 'must',
        executionModel: 'synchronous',
        config: {
          type: 'loop',
          maxIterations,
          exitConditionRef: 'check://done',
          ...(backoffMs != null ? { backoffMs } : {}),
        },
      },
      {
        id: BODY_NODE,
        name: 'Body',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://body', inputMappingRef: 'mapping://body' },
      },
      {
        id: EXIT_NODE,
        name: 'Exit',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://exit', inputMappingRef: 'mapping://exit' },
      },
    ],
    edges: [
      { id: EDGE_LOOP_BODY, from: LOOP_NODE, to: BODY_NODE, branchKey: 'loop', priority: 0 },
      { id: EDGE_LOOP_EXIT, from: LOOP_NODE, to: EXIT_NODE, branchKey: 'exit', priority: 1 },
    ],
  } as any);
}

function createContext(
  graph: ReturnType<typeof buildLoopGraph>,
  attemptCount = 0,
  payload?: WorkflowNodeExecutionPayload,
): WorkflowNodeExecutionContext {
  return {
    projectConfig: { id: PROJECT_ID } as any,
    graph,
    runState: {
      runId: RUN_ID,
      nodeStates: {
        [LOOP_NODE]: {
          status: 'ready',
          attempts: Array.from({ length: attemptCount }, (_, i) => ({
            attempt: i + 1,
            status: 'completed',
          })),
          activeAttempt: null,
        },
      },
    } as any,
    nodeDefinition: graph.nodes[LOOP_NODE]!.definition,
    dispatchLineage: {
      id: LINEAGE_ID,
      runId: RUN_ID,
      nodeDefinitionId: LOOP_NODE,
      attempt: attemptCount + 1,
      evidenceRefs: ['test_evidence'],
      occurredAt: '2026-03-31T00:00:00.000Z',
    } as any,
    controlState: 'running' as any,
    governanceInput: {} as any,
    governanceDecision: createGovernanceDecision(),
    payload,
  };
}

describe('LoopWorkflowNodeHandler', () => {
  const handler = new LoopWorkflowNodeHandler();

  it('implements IWorkflowNodeHandler with correct nodeType', () => {
    expect(handler.nodeType).toBe('loop');
    expect(typeof handler.execute).toBe('function');
  });

  it('throws when config type is not loop', async () => {
    const graph = buildLoopGraph();
    const context = createContext(graph);
    context.nodeDefinition = {
      ...context.nodeDefinition,
      config: { type: 'condition', predicateRef: 'test', trueBranchKey: 'a', falseBranchKey: 'b' },
    } as any;

    await expect(handler.execute(context)).rejects.toThrow(
      'LoopWorkflowNodeHandler received non loop config',
    );
  });

  it('returns selectedBranchKey: loop when exit condition is false and iterations remaining', async () => {
    const graph = buildLoopGraph(5);
    const context = createContext(graph, 0, { conditionResult: false, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('loop');
    expect(result.reasonCode).toBe('workflow_loop_continue');
  });

  it('returns selectedBranchKey: exit when exit condition evaluates true', async () => {
    const graph = buildLoopGraph(5);
    const context = createContext(graph, 0, { conditionResult: true, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('exit');
    expect(result.reasonCode).toBe('workflow_loop_exit_condition_met');
  });

  it('returns selectedBranchKey: exit when maxIterations reached', async () => {
    const graph = buildLoopGraph(3);
    // 3 previous attempts means iteration 4 > maxIterations of 3
    const context = createContext(graph, 3);
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('exit');
    expect(result.reasonCode).toBe('workflow_loop_max_iterations');
  });

  it('checks maxIterations before exitConditionRef evaluation (safety invariant)', async () => {
    const graph = buildLoopGraph(2);
    // 2 previous attempts, maxIterations=2, conditionResult=false (would continue if not capped)
    const context = createContext(graph, 2, { conditionResult: false, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('exit');
    expect(result.reasonCode).toBe('workflow_loop_max_iterations');
  });

  it('returns waiting with loop_backoff when backoffMs is configured and continuing', async () => {
    const graph = buildLoopGraph(5, 200);
    const context = createContext(graph, 0, { conditionResult: false, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('waiting');
    expect(result.waitState?.kind).toBe('loop_backoff');
    expect(result.waitState?.externalRef).toBe('backoff_ms=200');
    expect(result.selectedBranchKey).toBe('loop');
    expect(result.reasonCode).toBe('workflow_loop_backoff');
  });

  it('does not apply backoff when exit condition is met', async () => {
    const graph = buildLoopGraph(5, 200);
    const context = createContext(graph, 0, { conditionResult: true, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('exit');
    expect(result.waitState).toBeUndefined();
  });

  it('returns selectedBranchKey: exit when maxIterations is 1 and condition met on first execution', async () => {
    const graph = buildLoopGraph(1);
    const context = createContext(graph, 0, { conditionResult: true, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('exit');
    expect(result.reasonCode).toBe('workflow_loop_exit_condition_met');
  });

  it('returns selectedBranchKey: loop when maxIterations is 1 and condition not met on first execution', async () => {
    const graph = buildLoopGraph(1);
    const context = createContext(graph, 0, { conditionResult: false, detail: {} });
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('loop');
    expect(result.reasonCode).toBe('workflow_loop_continue');
  });

  it('evidence refs include iteration and max_iterations', async () => {
    const graph = buildLoopGraph(10);
    const context = createContext(graph, 4);
    const result = await handler.execute(context);

    expect(result.evidenceRefs).toContain('iteration=5');
    expect(result.evidenceRefs).toContain('max_iterations=10');
  });

  it('defaults to continuing when conditionResult is absent (no payload)', async () => {
    const graph = buildLoopGraph(5);
    const context = createContext(graph, 0);
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('loop');
    expect(result.reasonCode).toBe('workflow_loop_continue');
  });
});
