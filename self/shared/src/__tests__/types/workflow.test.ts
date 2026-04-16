import { describe, it, expect } from 'vitest';
import {
  DerivedWorkflowGraphSchema,
  WorkflowAdmissionRequestSchema,
  WorkflowAdmissionResultSchema,
  WorkflowContinueNodeRequestSchema,
  WorkflowCorrectionArcSchema,
  WorkflowDefinitionSchema,
  WorkflowDispatchLineageSchema,
  WorkflowExecuteNodeRequestSchema,
  WorkflowGraphSchema,
  WorkflowNodeDefinitionSchema,
  WorkflowNodeAttemptSchema,
  WorkflowNodeRunStateSchema,
  WorkflowNodeWaitStateSchema,
  WorkflowRunStatusSchema,
  WorkflowRunTriggerContextSchema,
  WorkflowRunStateSchema,
  WorkflowStartResultSchema,
  WorkflowStateSchema,
  WorkflowTransitionInputSchema,
  WorkflowModelCallNodeConfigSchema,
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
const ARC_ID = '550e8400-e29b-41d4-a716-446655440010';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440011';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440012';
const CHECKPOINT_ID = '550e8400-e29b-41d4-a716-446655440013';
const DIGEST =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const NOW = '2026-03-08T00:00:00.000Z';
const TRIGGER_ID = '550e8400-e29b-41d4-a716-446655440014';

const governanceEvidenceRef = {
  actionCategory: 'model-invoke' as const,
  authorizationEventId: EVENT_ID,
};

const governanceDecision = {
  outcome: 'allow_with_flag' as const,
  reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
  governance: 'must' as const,
  actionCategory: 'model-invoke' as const,
  projectControlState: 'running' as const,
  patternId: PATTERN_ID,
  confidence: 0.94,
  confidenceTier: 'high' as const,
  supportingSignals: 16,
  decayState: 'stable' as const,
  autonomyAllowed: false,
  requiresConfirmation: false,
  highRiskOverrideApplied: false,
  evidenceRefs: [governanceEvidenceRef],
  explanation: {
    patternId: PATTERN_ID,
    outcomeRef: `workflow:${NODE_A_ID}`,
    evidenceRefs: [governanceEvidenceRef],
  },
};

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
      config: {
        type: 'model-call',
        modelRole: 'cortex-chat',
        promptRef: 'prompt://draft',
      },
    },
    {
      id: NODE_B_ID,
      name: 'Review',
      type: 'quality-gate',
      governance: 'must',
      executionModel: 'synchronous',
      config: {
        type: 'quality-gate',
        evaluatorRef: 'evaluator://quality',
        passThresholdRef: 'threshold://default',
        failureAction: 'reprompt',
      },
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

const waitState = {
  kind: 'human_decision' as const,
  reasonCode: 'workflow_waiting_for_human',
  evidenceRefs: ['workflow:wait'],
  requestedAt: NOW,
  resumeToken: 'resume-token',
  externalRef: 'human://queue/review',
};

const correctionArc = {
  id: ARC_ID,
  runId: RUN_ID,
  nodeDefinitionId: NODE_A_ID,
  type: 'resume' as const,
  sourceAttempt: 1,
  checkpointId: CHECKPOINT_ID,
  reasonCode: 'workflow_human_decision_approved',
  evidenceRefs: ['workflow:resume'],
  occurredAt: NOW,
};

const triggerContext = {
  triggerId: TRIGGER_ID,
  triggerType: 'scheduler' as const,
  sourceId: 'scheduler://phase-9.3',
  workflowRef: WORKFLOW_ID,
  workmodeId: 'system:implementation',
  idempotencyKey: 'schedule:daily:1',
  dispatchRef: 'dispatch://workflow-start',
  evidenceRef: 'evidence://workflow-start',
  occurredAt: NOW,
};

const nodeAttempt = {
  attempt: 1,
  status: 'waiting' as const,
  dispatchLineageId: LINEAGE_ID,
  governanceDecision,
  waitState,
  sideEffectStatus: 'none' as const,
  checkpointId: CHECKPOINT_ID,
  outputRef: 'artifact://draft',
  reasonCode: 'workflow_waiting_for_human',
  evidenceRefs: ['workflow:wait'],
  startedAt: NOW,
  updatedAt: NOW,
};

const runState = {
  runId: RUN_ID,
  workflowDefinitionId: WORKFLOW_ID,
  projectId: PROJECT_ID,
  workflowVersion: '1.0.0',
  graphDigest: DIGEST,
  status: 'waiting' as const,
  admission: {
    allowed: true,
    reasonCode: 'workflow_admitted',
    evidenceRefs: ['workflow:admission'],
  },
  reasonCode: 'workflow_waiting_for_human',
  evidenceRefs: ['workflow:wait'],
  activeNodeIds: [NODE_A_ID],
  activatedEdgeIds: [],
  readyNodeIds: [],
  waitingNodeIds: [NODE_A_ID],
  blockedNodeIds: [],
  completedNodeIds: [],
  lastPreparedCheckpointId: CHECKPOINT_ID,
  checkpointState: 'commit_pending' as const,
  triggerContext,
  nodeStates: {
    [NODE_A_ID]: {
      id: NODE_RUN_A_ID,
      nodeDefinitionId: NODE_A_ID,
      status: 'waiting',
      attempts: [nodeAttempt],
      activeAttempt: 1,
      latestGovernanceDecision: governanceDecision,
      activeWaitState: waitState,
      correctionArcs: [correctionArc],
      reasonCode: 'workflow_waiting_for_human',
      evidenceRefs: ['workflow:wait'],
      lastDispatchLineageId: LINEAGE_ID,
      updatedAt: NOW,
    },
    [NODE_B_ID]: {
      id: NODE_RUN_B_ID,
      nodeDefinitionId: NODE_B_ID,
      status: 'pending',
      attempts: [],
      activeAttempt: null,
      correctionArcs: [],
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

  it('rejects node config.type mismatches', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      ...definition,
      nodes: [
        {
          ...definition.nodes[0],
          config: {
            type: 'transform',
            transformRef: 'transform://normalize',
            inputMappingRef: 'mapping://draft',
          },
        },
        definition.nodes[1],
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects condition configs with duplicate branch keys', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      ...definition,
      nodes: [
        {
          ...definition.nodes[0],
          type: 'condition',
          config: {
            type: 'condition',
            predicateRef: 'predicate://ready',
            trueBranchKey: 'same',
            falseBranchKey: 'same',
          },
        },
        definition.nodes[1],
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts additive node metadata and preserves it through parsing', () => {
    const parsed = WorkflowDefinitionSchema.parse({
      ...definition,
      nodes: [
        {
          ...definition.nodes[0],
          metadata: {
            specNodeId: 'draft-node',
            skill: 'atomic-research',
            contracts: ['quality-gate'],
            templates: ['goals-template'],
          },
        },
        definition.nodes[1],
      ],
    });

    expect(parsed.nodes[0]?.metadata?.specNodeId).toBe('draft-node');
    expect(parsed.nodes[0]?.metadata?.skill).toBe('atomic-research');
  });
});

describe('DerivedWorkflowGraphSchema', () => {
  it('accepts a valid derived graph and alias', () => {
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

describe('Workflow admission schemas', () => {
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

  it('accepts blocked admission with evidence refs and rejects empty evidence', () => {
    expect(
      WorkflowAdmissionResultSchema.safeParse({
        allowed: false,
        reasonCode: 'POL-CONTROL-STATE-BLOCKED',
        evidenceRefs: ['control_state=hard_stopped'],
      }).success,
    ).toBe(true);

    expect(
      WorkflowAdmissionResultSchema.safeParse({
        allowed: false,
        reasonCode: 'POL-CONTROL-STATE-BLOCKED',
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
});

describe('Workflow runtime schemas', () => {
  it('accepts a standalone workflow node definition with metadata', () => {
    expect(
      WorkflowNodeDefinitionSchema.safeParse({
        ...definition.nodes[0],
        metadata: {
          specNodeId: 'draft-node',
          skill: 'atomic-research',
          contracts: ['quality-gate'],
          templates: ['goals-template'],
        },
      }).success,
    ).toBe(true);
  });

  it('accepts the additive canceled workflow run status', () => {
    expect(WorkflowRunStatusSchema.parse('canceled')).toBe('canceled');
  });

  it('accepts wait states, correction arcs, attempts, and node run state', () => {
    expect(WorkflowDispatchLineageSchema.safeParse(dispatchLineage).success).toBe(
      true,
    );
    expect(WorkflowNodeWaitStateSchema.safeParse(waitState).success).toBe(true);
    expect(WorkflowCorrectionArcSchema.safeParse(correctionArc).success).toBe(
      true,
    );
    expect(WorkflowNodeAttemptSchema.safeParse(nodeAttempt).success).toBe(true);
    expect(WorkflowRunTriggerContextSchema.safeParse(triggerContext).success).toBe(
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

  it('rejects wait states without evidence refs', () => {
    expect(
      WorkflowNodeWaitStateSchema.safeParse({
        ...waitState,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
});

describe('Workflow request schemas', () => {
  it('accepts transition, execute, and continue request payloads', () => {
    expect(
      WorkflowTransitionInputSchema.safeParse({
        reasonCode: 'node_completed',
        evidenceRefs: ['workflow:complete'],
      }).success,
    ).toBe(true);

    expect(
      WorkflowExecuteNodeRequestSchema.safeParse({
        executionId: RUN_ID,
        nodeDefinitionId: NODE_A_ID,
        controlState: 'running',
        payload: {
          outputRef: 'artifact://draft',
          detail: {
            source: 'test',
          },
        },
        transition: {
          reasonCode: 'node_executed',
          evidenceRefs: ['workflow:execute'],
        },
      }).success,
    ).toBe(true);

    expect(
      WorkflowContinueNodeRequestSchema.safeParse({
        executionId: RUN_ID,
        nodeDefinitionId: NODE_A_ID,
        controlState: 'running',
        action: 'resume',
        continuationToken: 'resume-token',
        checkpointId: CHECKPOINT_ID,
        payload: {
          humanDecision: 'approved',
          outputRef: 'artifact://reviewed',
        },
        transition: {
          reasonCode: 'node_resumed',
          evidenceRefs: ['workflow:resume'],
        },
      }).success,
    ).toBe(true);
  });
});

// ─── U2 Migration Tests ────────────────────────────────────────────────────

describe('WorkflowModelCallNodeConfigSchema U2 migration', () => {
  it('(i) remaps modelRole "reasoner" to "cortex-chat"', () => {
    const result = WorkflowModelCallNodeConfigSchema.safeParse({
      type: 'model-call',
      modelRole: 'reasoner',
      promptRef: 'prompt://test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelRole).toBe('cortex-chat');
    }
  });

  it('(ii) remaps modelRole "orchestrator" to "orchestrators"', () => {
    const result = WorkflowModelCallNodeConfigSchema.safeParse({
      type: 'model-call',
      modelRole: 'orchestrator',
      promptRef: 'prompt://test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelRole).toBe('orchestrators');
    }
  });

  it('(iii) dropped literal "tool-advisor" causes safeParse failure', () => {
    const result = WorkflowModelCallNodeConfigSchema.safeParse({
      type: 'model-call',
      modelRole: 'tool-advisor',
      promptRef: 'prompt://test',
    });
    expect(result.success).toBe(false);
  });
});
