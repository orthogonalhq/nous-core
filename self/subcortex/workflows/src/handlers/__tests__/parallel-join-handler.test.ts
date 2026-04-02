import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../../graph-builder.js';
import { ParallelJoinWorkflowNodeHandler } from '../parallel-join-handler.js';
import type { WorkflowNodeExecutionContext, WorkflowRunState } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440601';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440602';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440603';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440604';
const BRANCH_C = '550e8400-e29b-41d4-a716-446655440605';
const JOIN_NODE = '550e8400-e29b-41d4-a716-446655440606';
const EDGE_A_JOIN = '550e8400-e29b-41d4-a716-446655440607';
const EDGE_B_JOIN = '550e8400-e29b-41d4-a716-446655440608';
const EDGE_C_JOIN = '550e8400-e29b-41d4-a716-446655440609';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440610';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440611';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440612';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440613';

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

function buildJoinGraph(joinMode: 'all' | 'any' | 'n-of-m', requiredCount?: number, timeoutMs?: number) {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Join Test',
    entryNodeIds: [BRANCH_A, BRANCH_B, BRANCH_C],
    nodes: [
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
      {
        id: BRANCH_C,
        name: 'Branch C',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://c', inputMappingRef: 'mapping://c' },
      },
      {
        id: JOIN_NODE,
        name: 'Join',
        type: 'parallel-join',
        governance: 'must',
        executionModel: 'synchronous',
        config: {
          type: 'parallel-join',
          joinMode,
          ...(requiredCount != null ? { requiredCount } : {}),
          ...(timeoutMs != null ? { timeoutMs } : {}),
        },
      },
    ],
    edges: [
      { id: EDGE_A_JOIN, from: BRANCH_A, to: JOIN_NODE, priority: 0 },
      { id: EDGE_B_JOIN, from: BRANCH_B, to: JOIN_NODE, priority: 0 },
      { id: EDGE_C_JOIN, from: BRANCH_C, to: JOIN_NODE, priority: 0 },
    ],
  } as any);
}

function createContext(
  graph: ReturnType<typeof buildJoinGraph>,
  upstreamStatuses: Record<string, string>,
): WorkflowNodeExecutionContext {
  const nodeStates: Record<string, any> = {};
  for (const [nodeId, status] of Object.entries(upstreamStatuses)) {
    nodeStates[nodeId] = { status, attempts: [], activeAttempt: null };
  }
  nodeStates[JOIN_NODE] = { status: 'ready', attempts: [], activeAttempt: null };

  return {
    projectConfig: { id: PROJECT_ID } as any,
    graph,
    runState: { runId: RUN_ID, nodeStates } as Partial<WorkflowRunState> as any,
    nodeDefinition: graph.nodes[JOIN_NODE]!.definition,
    dispatchLineage: {
      id: LINEAGE_ID,
      runId: RUN_ID,
      nodeDefinitionId: JOIN_NODE,
      evidenceRefs: ['test_evidence'],
      occurredAt: '2026-03-31T00:00:00.000Z',
    } as any,
    controlState: 'running' as any,
    governanceInput: {} as any,
    governanceDecision: createGovernanceDecision(),
  };
}

describe('ParallelJoinWorkflowNodeHandler', () => {
  const handler = new ParallelJoinWorkflowNodeHandler();

  it('implements IWorkflowNodeHandler with correct nodeType', () => {
    expect(handler.nodeType).toBe('parallel-join');
    expect(typeof handler.execute).toBe('function');
  });

  describe('joinMode: all', () => {
    it('returns completed when all upstream nodes are completed', async () => {
      const graph = buildJoinGraph('all');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'completed',
        [BRANCH_C]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.reasonCode).toBe('workflow_parallel_join_completed');
    });

    it('returns waiting when not all upstream nodes are completed', async () => {
      const graph = buildJoinGraph('all');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'running',
        [BRANCH_C]: 'pending',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('waiting');
      expect(result.waitState?.kind).toBe('parallel_join');
      expect(result.reasonCode).toBe('workflow_parallel_join_waiting');
    });

    it('returns completed when all upstream are resolved (completed or skipped)', async () => {
      const graph = buildJoinGraph('all');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'skipped',
        [BRANCH_C]: 'skipped',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
    });
  });

  describe('joinMode: any', () => {
    it('returns completed when one upstream node is completed', async () => {
      const graph = buildJoinGraph('any');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'running',
        [BRANCH_C]: 'pending',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.reasonCode).toBe('workflow_parallel_join_completed');
    });

    it('returns waiting when zero upstream nodes are completed', async () => {
      const graph = buildJoinGraph('any');
      const context = createContext(graph, {
        [BRANCH_A]: 'running',
        [BRANCH_B]: 'running',
        [BRANCH_C]: 'pending',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('waiting');
    });
  });

  describe('joinMode: n-of-m', () => {
    it('returns completed when N upstream nodes are completed (N=2, 2 of 3 done)', async () => {
      const graph = buildJoinGraph('n-of-m', 2);
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'completed',
        [BRANCH_C]: 'running',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
    });

    it('returns waiting when fewer than N upstream nodes are completed', async () => {
      const graph = buildJoinGraph('n-of-m', 2);
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'running',
        [BRANCH_C]: 'pending',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('waiting');
    });

    it('defaults to all when requiredCount is undefined', async () => {
      const graph = buildJoinGraph('n-of-m');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'completed',
        [BRANCH_C]: 'running',
      });
      const result = await handler.execute(context);

      // Should still be waiting because requiredCount defaults to totalUpstreamCount (3)
      expect(result.outcome).toBe('waiting');
    });

    it('returns failed when requiredCount exceeds upstream count', async () => {
      const graph = buildJoinGraph('n-of-m', 5);
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'completed',
        [BRANCH_C]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('failed');
      expect(result.reasonCode).toBe('workflow_parallel_join_invalid_required_count');
    });
  });

  describe('timeout', () => {
    it('includes timeoutMs in wait state externalRef', async () => {
      const graph = buildJoinGraph('all', undefined, 5000);
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'running',
        [BRANCH_C]: 'pending',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('waiting');
      expect(result.waitState?.externalRef).toBe('timeout_ms=5000');
    });
  });

  describe('edge cases', () => {
    it('returns failed when join has no inbound edges', async () => {
      // Build a graph with a join node that has no inbound edges
      const graph = buildDerivedWorkflowGraph({
        id: WORKFLOW_ID,
        projectId: PROJECT_ID,
        mode: 'hybrid',
        version: '1.0.0',
        name: 'No Inbound Join',
        entryNodeIds: [JOIN_NODE],
        nodes: [
          {
            id: JOIN_NODE,
            name: 'Join',
            type: 'parallel-join',
            governance: 'must',
            executionModel: 'synchronous',
            config: { type: 'parallel-join', joinMode: 'all' },
          },
        ],
        edges: [],
      } as any);

      const context: WorkflowNodeExecutionContext = {
        projectConfig: { id: PROJECT_ID } as any,
        graph,
        runState: { runId: RUN_ID, nodeStates: { [JOIN_NODE]: { status: 'ready' } } } as any,
        nodeDefinition: graph.nodes[JOIN_NODE]!.definition,
        dispatchLineage: {
          id: LINEAGE_ID,
          runId: RUN_ID,
          nodeDefinitionId: JOIN_NODE,
          evidenceRefs: [],
          occurredAt: '2026-03-31T00:00:00.000Z',
        } as any,
        controlState: 'running' as any,
        governanceInput: {} as any,
        governanceDecision: createGovernanceDecision(),
      };

      const result = await handler.execute(context);
      expect(result.outcome).toBe('failed');
      expect(result.reasonCode).toBe('workflow_parallel_join_no_upstream');
    });

    it('does not count failed upstream as completed', async () => {
      const graph = buildJoinGraph('all');
      const context = createContext(graph, {
        [BRANCH_A]: 'failed',
        [BRANCH_B]: 'failed',
        [BRANCH_C]: 'failed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('waiting');
    });

    it('throws when config type is not parallel-join', async () => {
      const graph = buildJoinGraph('all');
      const context = createContext(graph, {
        [BRANCH_A]: 'completed',
        [BRANCH_B]: 'completed',
        [BRANCH_C]: 'completed',
      });
      context.nodeDefinition = {
        ...context.nodeDefinition,
        config: { type: 'condition', predicateRef: 'test', trueBranchKey: 'a', falseBranchKey: 'b' },
      } as any;

      await expect(handler.execute(context)).rejects.toThrow(
        'ParallelJoinWorkflowNodeHandler received non parallel-join config',
      );
    });
  });
});
