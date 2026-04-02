import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../../graph-builder.js';
import { ParallelSplitWorkflowNodeHandler } from '../parallel-split-handler.js';
import type { WorkflowNodeExecutionContext } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440502';
const SPLIT_NODE = '550e8400-e29b-41d4-a716-446655440503';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440504';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440505';
const EDGE_SPLIT_A = '550e8400-e29b-41d4-a716-446655440506';
const EDGE_SPLIT_B = '550e8400-e29b-41d4-a716-446655440507';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440508';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440509';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440510';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440511';

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

function buildSplitGraph(splitMode: 'all' | 'race', hasBranches = true) {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Split Test',
    entryNodeIds: [SPLIT_NODE],
    nodes: [
      {
        id: SPLIT_NODE,
        name: 'Split',
        type: 'parallel-split',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'parallel-split', splitMode, branches: [] },
      },
      ...(hasBranches
        ? [
            {
              id: BRANCH_A,
              name: 'Branch A',
              type: 'transform',
              governance: 'must',
              executionModel: 'synchronous',
              config: { type: 'transform', transformRef: 'transform://a', inputMappingRef: 'mapping://a' },
            },
            {
              id: BRANCH_B,
              name: 'Branch B',
              type: 'transform',
              governance: 'must',
              executionModel: 'synchronous',
              config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' },
            },
          ]
        : []),
    ],
    edges: hasBranches
      ? [
          { id: EDGE_SPLIT_A, from: SPLIT_NODE, to: BRANCH_A, branchKey: 'branch-a', priority: 0 },
          { id: EDGE_SPLIT_B, from: SPLIT_NODE, to: BRANCH_B, branchKey: 'branch-b', priority: 1 },
        ]
      : [],
  } as any);
}

function createContext(
  graph: ReturnType<typeof buildSplitGraph>,
  splitMode: 'all' | 'race',
): WorkflowNodeExecutionContext {
  return {
    projectConfig: { id: PROJECT_ID } as any,
    graph,
    runState: { runId: RUN_ID, nodeStates: {} } as any,
    nodeDefinition: graph.nodes[SPLIT_NODE]!.definition,
    dispatchLineage: {
      id: LINEAGE_ID,
      runId: RUN_ID,
      nodeDefinitionId: SPLIT_NODE,
      evidenceRefs: ['test_evidence'],
      occurredAt: '2026-03-31T00:00:00.000Z',
    } as any,
    controlState: 'running' as any,
    governanceInput: {} as any,
    governanceDecision: createGovernanceDecision(),
  };
}

describe('ParallelSplitWorkflowNodeHandler', () => {
  const handler = new ParallelSplitWorkflowNodeHandler();

  it('implements IWorkflowNodeHandler with correct nodeType', () => {
    expect(handler.nodeType).toBe('parallel-split');
    expect(typeof handler.execute).toBe('function');
  });

  it('returns completed with selectedBranchKey undefined for splitMode: all', async () => {
    const graph = buildSplitGraph('all');
    const context = createContext(graph, 'all');
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBeUndefined();
    expect(result.reasonCode).toBe('workflow_parallel_split_activated');
    expect(result.sideEffectStatus).toBe('none');
    expect(result.governanceDecision).toBeDefined();
    expect(result.evidenceRefs).toContain('split_mode=all');
  });

  it('returns completed with selectedBranchKey undefined for splitMode: race', async () => {
    const graph = buildSplitGraph('race');
    const context = createContext(graph, 'race');
    const result = await handler.execute(context);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBeUndefined();
    expect(result.reasonCode).toBe('workflow_parallel_split_activated');
    expect(result.evidenceRefs).toContain('split_mode=race');
  });

  it('returns failed when split node has no outbound edges', async () => {
    const graph = buildSplitGraph('all', false);
    const context = createContext(graph, 'all');
    const result = await handler.execute(context);

    expect(result.outcome).toBe('failed');
    expect(result.reasonCode).toBe('workflow_parallel_split_no_branches');
  });

  it('throws when config type is not parallel-split', async () => {
    const graph = buildSplitGraph('all');
    const context = createContext(graph, 'all');
    context.nodeDefinition = {
      ...context.nodeDefinition,
      config: { type: 'condition', predicateRef: 'test', trueBranchKey: 'a', falseBranchKey: 'b' },
    } as any;

    await expect(handler.execute(context)).rejects.toThrow(
      'ParallelSplitWorkflowNodeHandler received non parallel-split config',
    );
  });
});
