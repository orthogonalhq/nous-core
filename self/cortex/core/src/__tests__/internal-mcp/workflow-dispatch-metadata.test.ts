/**
 * Tier 2 — Behavioral tests for dispatch metadata construction.
 *
 * Tests `buildDispatchMetadata` which is the extracted helper used by
 * `toWorkflowInstanceSummary` to build per-node dispatch metadata.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  DerivedWorkflowGraph,
  WorkflowNodeDefinitionId,
  WorkflowDispatchLineage,
  WorkflowDispatchLineageId,
  WorkflowDefinitionId,
  WorkflowEdgeId,
  WorkflowExecutionId,
  ProjectId,
} from '@nous/shared';
import { buildDispatchMetadata } from '../../internal-mcp/dispatch-metadata.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodeId(): WorkflowNodeDefinitionId {
  return randomUUID() as WorkflowNodeDefinitionId;
}

function makeGraph(
  nodes: Array<{
    id: WorkflowNodeDefinitionId;
    type: string;
    name: string;
  }>,
): DerivedWorkflowGraph {
  const graphNodes: DerivedWorkflowGraph['nodes'] = {};
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    graphNodes[node.id] = {
      definition: {
        id: node.id,
        name: node.name,
        type: node.type as any,
        governance: 'should',
        executionModel: 'synchronous',
        config: { type: node.type as any } as any,
      },
      inboundEdgeIds: [],
      outboundEdgeIds: [],
      topologicalIndex: i,
    };
  }

  return {
    workflowDefinitionId: randomUUID() as WorkflowDefinitionId,
    projectId: randomUUID() as ProjectId,
    version: '1',
    graphDigest: 'a'.repeat(64),
    entryNodeIds: nodes.length > 0 ? [nodes[0]!.id] : [],
    topologicalOrder: nodes.map((n) => n.id),
    nodes: graphNodes,
    edges: {},
  };
}

function makeLineageEntry(
  nodeDefinitionId: WorkflowNodeDefinitionId,
): WorkflowDispatchLineage {
  return {
    id: randomUUID() as WorkflowDispatchLineageId,
    runId: randomUUID() as WorkflowExecutionId,
    nodeDefinitionId,
    attempt: 0,
    reasonCode: 'dispatched',
    evidenceRefs: [],
    occurredAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildDispatchMetadata', () => {
  it('builds correct metadata for a multi-node graph with mixed types', () => {
    const nodeA = makeNodeId();
    const nodeB = makeNodeId();

    const graph = makeGraph([
      { id: nodeA, type: 'model-call', name: 'Claude Agent' },
      { id: nodeB, type: 'condition', name: 'Check Result' },
    ]);

    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA, nodeB],
      graph,
      dispatchLineage: [],
    });

    expect(result).toHaveLength(2);

    const metadataA = result.find((m) => m.nodeDefinitionId === nodeA)!;
    expect(metadataA.nodeType).toBe('model-call');
    expect(metadataA.nodeName).toBe('Claude Agent');
    expect(metadataA.executionMode).toBe('dispatched');
    expect(metadataA.agentClass).toBe('Worker');
    expect(metadataA.dispatchLineageId).toBeUndefined();

    const metadataB = result.find((m) => m.nodeDefinitionId === nodeB)!;
    expect(metadataB.nodeType).toBe('condition');
    expect(metadataB.nodeName).toBe('Check Result');
    expect(metadataB.executionMode).toBe('internal');
    expect(metadataB.agentClass).toBeNull();
    expect(metadataB.dispatchLineageId).toBeUndefined();
  });

  it('returns [] when graph is null', () => {
    const nodeA = makeNodeId();
    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA],
      graph: null,
      dispatchLineage: [],
    });
    expect(result).toEqual([]);
  });

  it('returns [] when graph is undefined', () => {
    const nodeA = makeNodeId();
    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA],
      graph: undefined,
      dispatchLineage: [],
    });
    expect(result).toEqual([]);
  });

  it('returns [] when readyNodeIds is empty', () => {
    const graph = makeGraph([
      { id: makeNodeId(), type: 'model-call', name: 'Agent' },
    ]);
    const result = buildDispatchMetadata({
      readyNodeIds: [],
      graph,
      dispatchLineage: [],
    });
    expect(result).toEqual([]);
  });

  it('populates dispatchLineageId when a lineage entry exists', () => {
    const nodeA = makeNodeId();
    const nodeB = makeNodeId();

    const graph = makeGraph([
      { id: nodeA, type: 'model-call', name: 'Agent A' },
      { id: nodeB, type: 'tool-execution', name: 'Tool B' },
    ]);

    const lineageA = makeLineageEntry(nodeA);

    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA, nodeB],
      graph,
      dispatchLineage: [lineageA],
    });

    expect(result).toHaveLength(2);

    const metadataA = result.find((m) => m.nodeDefinitionId === nodeA)!;
    expect(metadataA.dispatchLineageId).toBe(lineageA.id);

    const metadataB = result.find((m) => m.nodeDefinitionId === nodeB)!;
    expect(metadataB.dispatchLineageId).toBeUndefined();
  });

  it('skips ready nodes not found in the graph (defensive)', () => {
    const nodeA = makeNodeId();
    const phantomNode = makeNodeId(); // not in graph

    const graph = makeGraph([
      { id: nodeA, type: 'transform', name: 'Transform Data' },
    ]);

    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA, phantomNode],
      graph,
      dispatchLineage: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.nodeDefinitionId).toBe(nodeA);
    expect(result[0]!.executionMode).toBe('internal');
  });

  it('maps subworkflow nodes to dispatched/Orchestrator', () => {
    const nodeA = makeNodeId();

    const graph = makeGraph([
      { id: nodeA, type: 'subworkflow', name: 'Sub Flow' },
    ]);

    const result = buildDispatchMetadata({
      readyNodeIds: [nodeA],
      graph,
      dispatchLineage: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.executionMode).toBe('dispatched');
    expect(result[0]!.agentClass).toBe('Orchestrator');
  });
});
