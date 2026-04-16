import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../../graph-builder.js';
import { ErrorHandlerWorkflowNodeHandler } from '../error-handler.js';
import type { WorkflowNodeExecutionContext, WorkflowRunState } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440b01';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440b02';
const UPSTREAM_A = '550e8400-e29b-41d4-a716-446655440b03';
const UPSTREAM_B = '550e8400-e29b-41d4-a716-446655440b04';
const ERROR_NODE = '550e8400-e29b-41d4-a716-446655440b05';
const ERROR_PATH = '550e8400-e29b-41d4-a716-446655440b06';
const NORMAL_PATH = '550e8400-e29b-41d4-a716-446655440b07';
const EDGE_A_ERR = '550e8400-e29b-41d4-a716-446655440b08';
const EDGE_B_ERR = '550e8400-e29b-41d4-a716-446655440b09';
const EDGE_ERR_ERROR = '550e8400-e29b-41d4-a716-446655440b10';
const EDGE_ERR_NORMAL = '550e8400-e29b-41d4-a716-446655440b11';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440b12';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440b13';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440b14';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440b15';

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

function buildErrorHandlerGraph(catchScope: 'upstream' | 'specific', targetNodeIds?: string[]) {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Error Handler Test',
    entryNodeIds: [UPSTREAM_A, UPSTREAM_B],
    nodes: [
      {
        id: UPSTREAM_A,
        name: 'Upstream A',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://a', inputMappingRef: 'mapping://a' },
      },
      {
        id: UPSTREAM_B,
        name: 'Upstream B',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' },
      },
      {
        id: ERROR_NODE,
        name: 'Error Handler',
        type: 'error-handler',
        governance: 'must',
        executionModel: 'synchronous',
        config: {
          type: 'error-handler',
          catchScope,
          ...(targetNodeIds ? { targetNodeIds } : {}),
        },
      },
      {
        id: ERROR_PATH,
        name: 'Error Path',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://error', inputMappingRef: 'mapping://error' },
      },
      {
        id: NORMAL_PATH,
        name: 'Normal Path',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://normal', inputMappingRef: 'mapping://normal' },
      },
    ],
    edges: [
      { id: EDGE_A_ERR, from: UPSTREAM_A, to: ERROR_NODE, priority: 0 },
      { id: EDGE_B_ERR, from: UPSTREAM_B, to: ERROR_NODE, priority: 0 },
      { id: EDGE_ERR_ERROR, from: ERROR_NODE, to: ERROR_PATH, branchKey: 'error', priority: 0 },
      { id: EDGE_ERR_NORMAL, from: ERROR_NODE, to: NORMAL_PATH, priority: 1 },
    ],
  } as any);
}

function createContext(
  graph: ReturnType<typeof buildErrorHandlerGraph>,
  upstreamStatuses: Record<string, string>,
): WorkflowNodeExecutionContext {
  const nodeStates: Record<string, any> = {};
  for (const [nodeId, status] of Object.entries(upstreamStatuses)) {
    nodeStates[nodeId] = { status, attempts: [], activeAttempt: null };
  }
  nodeStates[ERROR_NODE] = { status: 'ready', attempts: [], activeAttempt: null };

  return {
    projectConfig: { id: PROJECT_ID } as any,
    graph,
    runState: { runId: RUN_ID, nodeStates } as Partial<WorkflowRunState> as any,
    nodeDefinition: graph.nodes[ERROR_NODE]!.definition,
    dispatchLineage: {
      id: LINEAGE_ID,
      runId: RUN_ID,
      nodeDefinitionId: ERROR_NODE,
      evidenceRefs: ['test_evidence'],
      occurredAt: '2026-03-31T00:00:00.000Z',
    } as any,
    controlState: 'running' as any,
    governanceInput: {} as any,
    governanceDecision: createGovernanceDecision(),
  };
}

describe('ErrorHandlerWorkflowNodeHandler', () => {
  const handler = new ErrorHandlerWorkflowNodeHandler();

  it('implements IWorkflowNodeHandler with correct nodeType', () => {
    expect(handler.nodeType).toBe('error-handler');
    expect(typeof handler.execute).toBe('function');
  });

  it('throws when config type is not error-handler', async () => {
    const graph = buildErrorHandlerGraph('upstream');
    const context = createContext(graph, {});
    context.nodeDefinition = {
      ...context.nodeDefinition,
      config: { type: 'condition', predicateRef: 'test', trueBranchKey: 'a', falseBranchKey: 'b' },
    } as any;

    await expect(handler.execute(context)).rejects.toThrow(
      'ErrorHandlerWorkflowNodeHandler received non error-handler config',
    );
  });

  describe('catchScope: upstream', () => {
    it('returns selectedBranchKey: error when upstream node has failed', async () => {
      const graph = buildErrorHandlerGraph('upstream');
      const context = createContext(graph, {
        [UPSTREAM_A]: 'failed',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBe('error');
      expect(result.reasonCode).toBe('workflow_error_handler_caught');
      expect(result.outputRef).toContain(UPSTREAM_A);
    });

    it('returns passthrough when no upstream failures detected', async () => {
      const graph = buildErrorHandlerGraph('upstream');
      const context = createContext(graph, {
        [UPSTREAM_A]: 'completed',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBeUndefined();
      expect(result.reasonCode).toBe('workflow_error_handler_passthrough');
    });

    it('filters inspection to terminal statuses only', async () => {
      const graph = buildErrorHandlerGraph('upstream');
      // running is not terminal — should not be detected as failure
      const context = createContext(graph, {
        [UPSTREAM_A]: 'running',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBeUndefined();
      expect(result.reasonCode).toBe('workflow_error_handler_passthrough');
    });

    it('returns outputRef containing all failed node IDs', async () => {
      const graph = buildErrorHandlerGraph('upstream');
      const context = createContext(graph, {
        [UPSTREAM_A]: 'failed',
        [UPSTREAM_B]: 'failed',
      });
      const result = await handler.execute(context);

      expect(result.selectedBranchKey).toBe('error');
      expect(result.outputRef).toContain(UPSTREAM_A);
      expect(result.outputRef).toContain(UPSTREAM_B);
    });
  });

  describe('catchScope: specific', () => {
    it('returns selectedBranchKey: error when specific target node has failed', async () => {
      const graph = buildErrorHandlerGraph('specific', [UPSTREAM_A]);
      const context = createContext(graph, {
        [UPSTREAM_A]: 'failed',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBe('error');
      expect(result.reasonCode).toBe('workflow_error_handler_caught');
      expect(result.outputRef).toContain(UPSTREAM_A);
    });

    it('returns passthrough when specific target nodes are all completed', async () => {
      const graph = buildErrorHandlerGraph('specific', [UPSTREAM_A]);
      const context = createContext(graph, {
        [UPSTREAM_A]: 'completed',
        [UPSTREAM_B]: 'failed', // This is not in targetNodeIds, so ignored
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBeUndefined();
      expect(result.reasonCode).toBe('workflow_error_handler_passthrough');
    });

    it('returns failed when targetNodeIds contains non-existent node IDs', async () => {
      const graph = buildErrorHandlerGraph('specific', ['nonexistent-node-id']);
      const context = createContext(graph, {
        [UPSTREAM_A]: 'completed',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('failed');
      expect(result.reasonCode).toBe('workflow_error_handler_invalid_target');
      expect(result.evidenceRefs).toContain('invalid_target_node_id=nonexistent-node-id');
    });

    it('ignores skipped nodes (terminal but not failed)', async () => {
      const graph = buildErrorHandlerGraph('specific', [UPSTREAM_A]);
      const context = createContext(graph, {
        [UPSTREAM_A]: 'skipped',
        [UPSTREAM_B]: 'completed',
      });
      const result = await handler.execute(context);

      expect(result.outcome).toBe('completed');
      expect(result.selectedBranchKey).toBeUndefined();
      expect(result.reasonCode).toBe('workflow_error_handler_passthrough');
    });
  });

  it('evidence refs include catch_scope', async () => {
    const graph = buildErrorHandlerGraph('upstream');
    const context = createContext(graph, {
      [UPSTREAM_A]: 'completed',
      [UPSTREAM_B]: 'completed',
    });
    const result = await handler.execute(context);

    expect(result.evidenceRefs).toContain('catch_scope=upstream');
  });
});
