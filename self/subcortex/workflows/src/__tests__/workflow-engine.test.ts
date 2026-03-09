import { describe, it, expect, vi } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440502';
const NODE_A = '550e8400-e29b-41d4-a716-446655440503';
const NODE_B = '550e8400-e29b-41d4-a716-446655440504';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440505';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440506';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440508';
const TRIGGER_ID = '550e8400-e29b-41d4-a716-446655440509';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Engine Project',
  type: 'hybrid' as const,
  pfcTier: 2,
  modelAssignments: undefined,
  memoryAccessPolicy: {
    canReadFrom: 'all' as const,
    canBeReadBy: 'all' as const,
    inheritsGlobal: true,
  },
  escalationChannels: ['in-app' as const],
  workflow: {
    defaultWorkflowDefinitionId: WORKFLOW_ID,
    definitions: [
      {
        id: WORKFLOW_ID,
        projectId: PROJECT_ID,
        mode: 'hybrid' as const,
        version: '1.0.0',
        name: 'Engine Workflow',
        entryNodeIds: [NODE_A],
        nodes: [
          {
            id: NODE_A,
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call' as const,
              modelRole: 'reasoner' as const,
              promptRef: 'prompt://draft',
            },
          },
          {
            id: NODE_B,
            name: 'Review',
            type: 'quality-gate' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'quality-gate' as const,
              evaluatorRef: 'evaluator://quality',
              passThresholdRef: 'threshold://default',
              failureAction: 'block' as const,
            },
          },
        ],
        edges: [
          {
            id: '550e8400-e29b-41d4-a716-446655440507',
            from: NODE_A,
            to: NODE_B,
            priority: 0,
          },
        ],
      },
    ],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

function createGovernanceDecision(input: {
  actionCategory: 'model-invoke' | 'trace-persist';
  governance: 'must';
  outcome?: 'allow_with_flag' | 'deny';
  reasonCode?: 'CGR-ALLOW-WITH-FLAG' | 'CGR-DENY-GOVERNANCE-CEILING';
}) {
  const evidenceRef = {
    actionCategory: input.actionCategory,
    authorizationEventId: EVENT_ID,
  };

  return {
    outcome: input.outcome ?? 'allow_with_flag',
    reasonCode: input.reasonCode ?? 'CGR-ALLOW-WITH-FLAG',
    governance: input.governance,
    actionCategory: input.actionCategory,
    projectControlState: 'running' as const,
    patternId: PATTERN_ID,
    confidence: 0.94,
    confidenceTier: 'high' as const,
    supportingSignals: 16,
    decayState: 'stable' as const,
    autonomyAllowed: false,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [evidenceRef],
    explanation: {
      patternId: PATTERN_ID,
      outcomeRef: `workflow:${WORKFLOW_ID}`,
      evidenceRefs: [evidenceRef],
    },
  } as any;
}

describe('DeterministicWorkflowEngine', () => {
  it('blocks start when control state disallows admission', async () => {
    const engine = new DeterministicWorkflowEngine();
    const result = await engine.start({
      projectConfig: projectConfig as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'hard_stopped',
    });

    expect(result.status).toBe('admission_blocked');
    if (result.status === 'admission_blocked') {
      expect(result.admission.reasonCode).toBe('POL-CONTROL-STATE-BLOCKED');
    }
  });

  it('starts, persists, and advances workflow state through manual completion', async () => {
    const engine = new DeterministicWorkflowEngine();
    const started = await engine.start({
      projectConfig: projectConfig as any,
      runId: RUN_ID as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      triggerContext: {
        triggerId: TRIGGER_ID,
        triggerType: 'hook',
        sourceId: 'scheduler://event',
        workflowRef: WORKFLOW_ID,
        workmodeId: 'system:implementation',
        idempotencyKey: 'event:workflow-engine',
        dispatchRef: `dispatch:${RUN_ID}`,
        evidenceRef: `evidence:${TRIGGER_ID}`,
        occurredAt: '2026-03-08T00:00:00.000Z',
      },
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const runId = started.runState.runId;
    expect(runId).toBe(RUN_ID);
    expect(started.runState.triggerContext?.triggerId).toBe(TRIGGER_ID);
    const paused = await engine.pause(runId, {
      reasonCode: 'workflow_paused',
      evidenceRefs: ['workflow:pause'],
    });
    expect(paused.status).toBe('paused');

    const resumed = await engine.resume(runId, {
      reasonCode: 'workflow_resumed',
      evidenceRefs: ['workflow:resume'],
    });
    expect(resumed.status).toBe('ready');

    const afterFirstNode = await engine.completeNode(runId, NODE_A as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:a'],
    });
    expect(afterFirstNode.readyNodeIds).toEqual([NODE_B]);

    const afterSecondNode = await engine.completeNode(runId, NODE_B as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:b'],
    });
    expect(afterSecondNode.status).toBe('completed');

    const current = await engine.getState(runId);
    expect(current?.status).toBe('completed');
    expect(current?.triggerContext?.dispatchRef).toBe(`dispatch:${RUN_ID}`);
  });

  it('executes ready nodes through governance and handler dispatch', async () => {
    const pfcEngine = {
      evaluateConfidenceGovernance: vi.fn(
        async (input: { actionCategory: 'model-invoke' | 'trace-persist'; governance: 'must' }) =>
          createGovernanceDecision({
            actionCategory: input.actionCategory,
            governance: input.governance,
          }),
      ),
    };
    const modelRouter = {
      route: vi.fn(async () => 'provider://reasoner'),
    };
    const engine = new DeterministicWorkflowEngine({
      pfcEngine: pfcEngine as any,
      modelRouter: modelRouter as any,
    });

    const started = await engine.start({
      projectConfig: projectConfig as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const afterModel = await engine.executeReadyNode({
      executionId: started.runState.runId,
      nodeDefinitionId: NODE_A as any,
      controlState: 'running',
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:a'],
      },
    });

    expect(afterModel.completedNodeIds).toEqual([NODE_A]);
    expect(afterModel.readyNodeIds).toEqual([NODE_B]);
    expect(afterModel.nodeStates[NODE_A]?.attempts).toHaveLength(1);
    expect(afterModel.nodeStates[NODE_A]?.attempts[0]?.outputRef).toContain(
      'provider://reasoner',
    );

    const completed = await engine.executeReadyNode({
      executionId: started.runState.runId,
      nodeDefinitionId: NODE_B as any,
      controlState: 'running',
      payload: {
        qualityGatePassed: true,
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:b'],
      },
    });

    expect(completed.status).toBe('completed');
    expect(pfcEngine.evaluateConfidenceGovernance).toHaveBeenCalledTimes(2);
  });

  it('records blocked review when governance denies node execution', async () => {
    const pfcEngine = {
      evaluateConfidenceGovernance: vi.fn(
        async (input: { actionCategory: 'model-invoke'; governance: 'must' }) =>
          createGovernanceDecision({
            actionCategory: input.actionCategory,
            governance: input.governance,
            outcome: 'deny',
            reasonCode: 'CGR-DENY-GOVERNANCE-CEILING',
          }),
      ),
    };
    const engine = new DeterministicWorkflowEngine({
      pfcEngine: pfcEngine as any,
    });

    const started = await engine.start({
      projectConfig: projectConfig as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const blocked = await engine.executeReadyNode({
      executionId: started.runState.runId,
      nodeDefinitionId: NODE_A as any,
      controlState: 'running',
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:a'],
      },
    });

    expect(blocked.status).toBe('blocked_review');
    expect(blocked.blockedNodeIds).toEqual([NODE_A]);
    expect(blocked.nodeStates[NODE_A]?.status).toBe('blocked');
  });
});
