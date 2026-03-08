import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  createInitialWorkflowRunState,
  completeWorkflowNodeInRunState,
} from '../run-state.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440401';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440402';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440403';
const NODE_A = '550e8400-e29b-41d4-a716-446655440404';
const NODE_B = '550e8400-e29b-41d4-a716-446655440405';

const graph = buildDerivedWorkflowGraph({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Run State Workflow',
  entryNodeIds: [NODE_A],
  nodes: [
    { id: NODE_A, name: 'A', type: 'model-call', governance: 'must', executionModel: 'synchronous', config: {} },
    { id: NODE_B, name: 'B', type: 'quality-gate', governance: 'must', executionModel: 'synchronous', config: {} },
  ],
  edges: [
    { id: '550e8400-e29b-41d4-a716-446655440406', from: NODE_A, to: NODE_B, priority: 0 },
  ],
} as any);

describe('workflow run state helpers', () => {
  it('creates initial run state with entry nodes ready', () => {
    const runState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: '2026-03-08T00:00:00.000Z',
    });

    expect(runState.status).toBe('ready');
    expect(runState.readyNodeIds).toEqual([NODE_A]);
    expect(runState.dispatchLineage).toHaveLength(1);
  });

  it('completes nodes and advances successors deterministically', () => {
    const initial = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: '2026-03-08T00:00:00.000Z',
    });

    const advanced = completeWorkflowNodeInRunState(initial, graph, NODE_A as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:a'],
    });
    expect(advanced.completedNodeIds).toEqual([NODE_A]);
    expect(advanced.readyNodeIds).toEqual([NODE_B]);
    expect(advanced.dispatchLineage).toHaveLength(2);

    const completed = completeWorkflowNodeInRunState(advanced, graph, NODE_B as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:b'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.completedNodeIds).toEqual([NODE_A, NODE_B]);
  });
});
