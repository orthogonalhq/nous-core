import { describe, it, expect } from 'vitest';
import {
  WorkflowDefinitionSchema,
  DerivedWorkflowGraphSchema,
  WorkflowAdmissionRequestSchema,
  WorkflowAdmissionResultSchema,
  WorkflowDispatchLineageSchema,
  WorkflowNodeRunStateSchema,
  WorkflowRunStateSchema,
  WorkflowStartResultSchema,
  WorkflowTransitionInputSchema,
  WorkflowGraphSchema,
  WorkflowStateSchema,
} from '../../types/workflow.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440001';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440002';
const NODE_A_ID = '550e8400-e29b-41d4-a716-446655440003';
const NODE_B_ID = '550e8400-e29b-41d4-a716-446655440004';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440005';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440006';
const NODE_RUN_A_ID = '550e8400-e29b-41d4-a716-446655440007';
const NODE_RUN_B_ID = '550e8400-e29b-41d4-a716-446655440008';
const LINEAGE_ID = '550e8400-e29b-41d4-a716-446655440009';
const DIGEST = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = '2026-03-08T00:00:00.000Z';

const definition = {
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Example Workflow',
  entryNodeIds: [NODE_A_ID],
  nodes: [
    {
      id: NODE_A_ID,
      name: 'Draft',
      type: 'model-call',
      governance: 'must',
      executionModel: 'synchronous',
      config: {},
    },
    {
      id: NODE_B_ID,
      name: 'Review',
      type: 'quality-gate',
      governance: 'must',
      executionModel: 'synchronous',
      config: {},
    },
  ],
  edges: [
    {
      id: EDGE_ID,
      from: NODE_A_ID,
      to: NODE_B_ID,
      priority: 0,
    },
  ],
};

const graph = {
  workflowDefinitionId: WORKFLOW_ID,
  projectId: PROJECT_ID,
  version: '1.0.0',
  graphDigest: DIGEST,
  entryNodeIds: [NODE_A_ID],
  topologicalOrder: [NODE_A_ID, NODE_B_ID],
  nodes: {
    [NODE_A_ID]: {
      definition: definition.nodes[0],
      inboundEdgeIds: [],
      outboundEdgeIds: [EDGE_ID],
      topologicalIndex: 0,
    },
    [NODE_B_ID]: {
      definition: definition.nodes[1],
      inboundEdgeIds: [EDGE_ID],
      outboundEdgeIds: [],
      topologicalIndex: 1,
    },
  },
  edges: {
    [EDGE_ID]: definition.edges[0],
  },
};

const dispatchLineage = {
  id: LINEAGE_ID,
  runId: RUN_ID,
  nodeDefinitionId: NODE_A_ID,
  attempt: 0,
  reasonCode: 'workflow_started',
  evidenceRefs: ['workflow:start'],
  occurredAt: NOW,
};

const runState = {
  runId: RUN_ID,
  workflowDefinitionId: WORKFLOW_ID,
  projectId: PROJECT_ID,
  workflowVersion: '1.0.0',
  graphDigest: DIGEST,
  status: 'ready',
  admission: {
    allowed: true,
    reasonCode: 'workflow_admitted',
    evidenceRefs: ['workflow:admission'],
  },
  reasonCode: 'workflow_started',
  evidenceRefs: ['workflow:start'],
  readyNodeIds: [NODE_A_ID],
  completedNodeIds: [],
  nodeStates: {
    [NODE_A_ID]: {
      id: NODE_RUN_A_ID,
      nodeDefinitionId: NODE_A_ID,
      status: 'ready',
      attempt: 0,
      reasonCode: 'workflow_started',
      evidenceRefs: ['workflow:start'],
      lastDispatchLineageId: LINEAGE_ID,
      updatedAt: NOW,
    },
    [NODE_B_ID]: {
      id: NODE_RUN_B_ID,
      nodeDefinitionId: NODE_B_ID,
      status: 'pending',
      attempt: 0,
      evidenceRefs: [],
      updatedAt: NOW,
    },
  },
  dispatchLineage: [dispatchLineage],
  startedAt: NOW,
  updatedAt: NOW,
};

describe('WorkflowDefinitionSchema', () => {
  it('accepts a valid canonical workflow definition', () => {
    expect(WorkflowDefinitionSchema.safeParse(definition).success).toBe(true);
  });

  it('rejects a definition without entry nodes', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      ...definition,
      entryNodeIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('DerivedWorkflowGraphSchema', () => {
  it('accepts a valid derived graph', () => {
    expect(DerivedWorkflowGraphSchema.safeParse(graph).success).toBe(true);
    expect(WorkflowGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('rejects an invalid digest', () => {
    const result = DerivedWorkflowGraphSchema.safeParse({
      ...graph,
      graphDigest: 'not-a-digest',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowAdmission schemas', () => {
  it('accepts a valid admission request', () => {
    const result = WorkflowAdmissionRequestSchema.safeParse({
      projectId: PROJECT_ID,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      targetActor: 'worker_agent',
      controlState: 'running',
    });
    expect(result.success).toBe(true);
  });

  it('accepts blocked admission with evidence refs', () => {
    const result = WorkflowAdmissionResultSchema.safeParse({
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED',
      evidenceRefs: ['control_state=hard_stopped'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects blocked admission without evidence refs', () => {
    const result = WorkflowAdmissionResultSchema.safeParse({
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED',
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('Workflow runtime schemas', () => {
  it('accepts dispatch lineage and node run state', () => {
    expect(WorkflowDispatchLineageSchema.safeParse(dispatchLineage).success).toBe(
      true,
    );
    expect(
      WorkflowNodeRunStateSchema.safeParse(runState.nodeStates[NODE_A_ID]).success,
    ).toBe(true);
  });

  it('accepts a valid run state and start result aliases', () => {
    expect(WorkflowRunStateSchema.safeParse(runState).success).toBe(true);
    expect(WorkflowStateSchema.safeParse(runState).success).toBe(true);
    expect(
      WorkflowStartResultSchema.safeParse({
        status: 'started',
        graph,
        runState,
      }).success,
    ).toBe(true);
  });

  it('accepts transition input with reason code', () => {
    expect(
      WorkflowTransitionInputSchema.safeParse({
        reasonCode: 'node_completed',
        evidenceRefs: ['workflow:complete'],
      }).success,
    ).toBe(true);
  });
});
