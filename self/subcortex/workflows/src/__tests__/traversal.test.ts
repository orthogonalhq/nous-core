import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import { getInitialReadyNodeIds, getNextReadyNodeIds } from '../traversal.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440201';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440202';
const NODE_A = '550e8400-e29b-41d4-a716-446655440203';
const NODE_B = '550e8400-e29b-41d4-a716-446655440204';
const NODE_C = '550e8400-e29b-41d4-a716-446655440205';
const NODE_D = '550e8400-e29b-41d4-a716-446655440206';

describe('workflow traversal', () => {
  it('advances deterministically through a linear graph', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Linear Workflow',
      entryNodeIds: [NODE_A],
      nodes: [
        { id: NODE_A, name: 'A', type: 'model-call', governance: 'must', executionModel: 'synchronous', config: {} },
        { id: NODE_B, name: 'B', type: 'quality-gate', governance: 'must', executionModel: 'synchronous', config: {} },
        { id: NODE_C, name: 'C', type: 'transform', governance: 'must', executionModel: 'synchronous', config: {} },
      ],
      edges: [
        { id: '550e8400-e29b-41d4-a716-446655440207', from: NODE_A, to: NODE_B, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440208', from: NODE_B, to: NODE_C, priority: 0 },
      ],
    } as any);

    expect(getInitialReadyNodeIds(graph)).toEqual([NODE_A]);
    expect(getNextReadyNodeIds(graph, [NODE_A] as any, NODE_A as any)).toEqual([
      NODE_B,
    ]);
    expect(
      getNextReadyNodeIds(graph, [NODE_A, NODE_B] as any, NODE_B as any),
    ).toEqual([NODE_C]);
  });

  it('orders branching nodes by priority and waits for all parents', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Branch Workflow',
      entryNodeIds: [NODE_A],
      nodes: [
        { id: NODE_A, name: 'A', type: 'model-call', governance: 'must', executionModel: 'synchronous', config: {} },
        { id: NODE_B, name: 'B', type: 'quality-gate', governance: 'must', executionModel: 'synchronous', config: {} },
        { id: NODE_C, name: 'C', type: 'transform', governance: 'must', executionModel: 'synchronous', config: {} },
        { id: NODE_D, name: 'D', type: 'human-decision', governance: 'must', executionModel: 'synchronous', config: {} },
      ],
      edges: [
        { id: '550e8400-e29b-41d4-a716-446655440209', from: NODE_A, to: NODE_B, priority: 1 },
        { id: '550e8400-e29b-41d4-a716-446655440210', from: NODE_A, to: NODE_C, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440211', from: NODE_B, to: NODE_D, priority: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440212', from: NODE_C, to: NODE_D, priority: 0 },
      ],
    } as any);

    expect(getNextReadyNodeIds(graph, [NODE_A] as any, NODE_A as any)).toEqual([
      NODE_C,
      NODE_B,
    ]);
    expect(getNextReadyNodeIds(graph, [NODE_A, NODE_C] as any, NODE_C as any)).toEqual(
      [],
    );
    expect(
      getNextReadyNodeIds(
        graph,
        [NODE_A, NODE_C, NODE_B] as any,
        NODE_B as any,
      ),
    ).toEqual([NODE_D]);
  });
});
