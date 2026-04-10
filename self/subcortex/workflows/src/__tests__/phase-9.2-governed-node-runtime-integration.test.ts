import { describe, it, expect, vi } from 'vitest';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440801';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440802';
const NODE_A = '550e8400-e29b-41d4-a716-446655440803';
const NODE_B = '550e8400-e29b-41d4-a716-446655440804';
const NODE_C = '550e8400-e29b-41d4-a716-446655440805';
const NODE_D = '550e8400-e29b-41d4-a716-446655440806';
const NODE_E = '550e8400-e29b-41d4-a716-446655440807';
const NODE_F = '550e8400-e29b-41d4-a716-446655440808';
const CHECKPOINT_ID = '550e8400-e29b-41d4-a716-446655440809';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440810';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440811';

const projectConfig = {
  id: PROJECT_ID,
  name: 'Governed Runtime Project',
  type: 'hybrid' as const,
  pfcTier: 2,
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
        name: 'Governed Runtime Workflow',
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
              modelRole: 'cortex-chat' as const,
              promptRef: 'prompt://draft',
              outputSchemaRef: 'schema://node-output/draft',
            },
          },
          {
            id: NODE_B,
            name: 'Route',
            type: 'condition' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'condition' as const,
              predicateRef: 'predicate://route',
              trueBranchKey: 'publish',
              falseBranchKey: 'revise',
            },
          },
          {
            id: NODE_C,
            name: 'Publish',
            type: 'tool-execution' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'tool-execution' as const,
              toolName: 'publish',
              inputMappingRef: 'mapping://publish',
              resultSchemaRef: 'schema://node-output/publish',
            },
          },
          {
            id: NODE_D,
            name: 'Revise',
            type: 'transform' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'transform' as const,
              transformRef: 'transform://revise',
              inputMappingRef: 'mapping://draft',
            },
          },
          {
            id: NODE_E,
            name: 'Quality',
            type: 'quality-gate' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'quality-gate' as const,
              evaluatorRef: 'evaluator://quality',
              passThresholdRef: 'threshold://default',
              failureAction: 'reprompt' as const,
            },
          },
          {
            id: NODE_F,
            name: 'Approval',
            type: 'human-decision' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'human-decision' as const,
              decisionRef: 'decision://approve',
            },
          },
        ],
        edges: [
          { id: '550e8400-e29b-41d4-a716-446655440812', from: NODE_A, to: NODE_B, priority: 0 },
          {
            id: '550e8400-e29b-41d4-a716-446655440813',
            from: NODE_B,
            to: NODE_C,
            branchKey: 'publish',
            priority: 0,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440814',
            from: NODE_B,
            to: NODE_D,
            branchKey: 'revise',
            priority: 1,
          },
          { id: '550e8400-e29b-41d4-a716-446655440815', from: NODE_C, to: NODE_E, priority: 0 },
          { id: '550e8400-e29b-41d4-a716-446655440816', from: NODE_D, to: NODE_E, priority: 0 },
          { id: '550e8400-e29b-41d4-a716-446655440817', from: NODE_E, to: NODE_F, priority: 0 },
        ],
      },
    ],
    packageBindings: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

function createGovernanceDecision(input: {
  actionCategory:
    | 'model-invoke'
    | 'tool-execute'
    | 'trace-persist'
    | 'opctl-command';
}) {
  const evidenceRef = {
    actionCategory: input.actionCategory,
    authorizationEventId: EVENT_ID,
  };

  return {
    outcome: 'allow_with_flag' as const,
    reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
    governance: 'must' as const,
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

describe('Phase 9.2 governed workflow runtime integration', () => {
  it('executes the publish branch with deferred checkpoint commit and human approval', async () => {
    const pfcEngine = {
      evaluateConfidenceGovernance: vi.fn(
        async (input: { actionCategory: 'model-invoke' | 'tool-execute' | 'trace-persist' | 'opctl-command' }) =>
          createGovernanceDecision({ actionCategory: input.actionCategory }),
      ),
    };
    const modelRouter = {
      route: vi.fn(async () => 'provider://reasoner'),
    };
    const toolExecutor = {
      execute: vi.fn(async () => ({
        success: true,
        output: { published: true },
        durationMs: 5,
      })),
    };
    const checkpointManager = {
      prepare: vi.fn(async () => ({
        success: true,
        checkpoint_id: CHECKPOINT_ID,
      })),
      commit: vi.fn(async () => ({
        success: true,
      })),
    };
    const engine = new DeterministicWorkflowEngine({
      pfcEngine: pfcEngine as any,
      modelRouter: modelRouter as any,
      toolExecutor: toolExecutor as any,
      checkpointManager: checkpointManager as any,
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

    const runId = started.runState.runId;

    const afterDraft = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_A as any,
      controlState: 'running',
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:a'],
      },
    });
    expect(afterDraft.readyNodeIds).toEqual([NODE_B]);

    const afterRoute = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_B as any,
      controlState: 'running',
      payload: {
        selectedBranchKey: 'publish',
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:b'],
      },
    });
    expect(afterRoute.readyNodeIds).toEqual([NODE_C]);

    const waitingOnCheckpoint = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_C as any,
      controlState: 'running',
      payload: {
        toolParams: {
          draftId: 'draft-1',
        },
        sideEffectStatus: 'idempotent',
        checkpointCommitMode: 'deferred',
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:c'],
      },
    });
    expect(waitingOnCheckpoint.status).toBe('waiting');
    expect(waitingOnCheckpoint.nodeStates[NODE_C]?.activeWaitState?.kind).toBe(
      'checkpoint_commit',
    );
    expect(waitingOnCheckpoint.lastPreparedCheckpointId).toBe(CHECKPOINT_ID);

    const afterCheckpointCommit = await engine.continueNode({
      executionId: runId,
      nodeDefinitionId: NODE_C as any,
      controlState: 'running',
      action: 'resume',
      witnessRef: 'witness://checkpoint',
      transition: {
        reasonCode: 'node_resumed',
        evidenceRefs: ['workflow:resume:c'],
      },
    });
    expect(afterCheckpointCommit.lastCommittedCheckpointId).toBe(CHECKPOINT_ID);
    expect(afterCheckpointCommit.readyNodeIds).toEqual([NODE_E]);

    const afterQuality = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_E as any,
      controlState: 'running',
      payload: {
        qualityGatePassed: true,
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:e'],
      },
    });
    expect(afterQuality.readyNodeIds).toEqual([NODE_F]);

    const waitingOnHuman = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_F as any,
      controlState: 'running',
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:f'],
      },
    });
    const continuationToken =
      waitingOnHuman.nodeStates[NODE_F]?.activeWaitState?.resumeToken;

    expect(waitingOnHuman.status).toBe('waiting');
    expect(waitingOnHuman.nodeStates[NODE_F]?.activeWaitState?.kind).toBe(
      'human_decision',
    );
    expect(continuationToken).toBeTruthy();

    const completed = await engine.continueNode({
      executionId: runId,
      nodeDefinitionId: NODE_F as any,
      controlState: 'running',
      action: 'complete',
      continuationToken,
      payload: {
        humanDecision: 'approved',
        outputRef: 'human://approved',
        detail: {},
      },
      transition: {
        reasonCode: 'node_resumed',
        evidenceRefs: ['workflow:resume:f'],
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.completedNodeIds).toEqual([NODE_A, NODE_B, NODE_C, NODE_E, NODE_F]);
    expect(completed.nodeStates[NODE_F]?.correctionArcs[0]?.type).toBe('resume');
    expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
    expect(checkpointManager.prepare).toHaveBeenCalledTimes(1);
    expect(checkpointManager.commit).toHaveBeenCalledTimes(1);
  });

  it('executes the revise branch and records reprompt correction state on a failed quality gate', async () => {
    const pfcEngine = {
      evaluateConfidenceGovernance: vi.fn(
        async (input: { actionCategory: 'model-invoke' | 'trace-persist' }) =>
          createGovernanceDecision({ actionCategory: input.actionCategory }),
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

    const runId = started.runState.runId;

    await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_A as any,
      controlState: 'running',
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:a'],
      },
    });

    const afterRoute = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_B as any,
      controlState: 'running',
      payload: {
        selectedBranchKey: 'revise',
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:b'],
      },
    });
    expect(afterRoute.readyNodeIds).toEqual([NODE_D]);

    const afterTransform = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_D as any,
      controlState: 'running',
      payload: {
        outputRef: 'transform://revised',
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:d'],
      },
    });
    expect(afterTransform.readyNodeIds).toEqual([NODE_E]);

    const blocked = await engine.executeReadyNode({
      executionId: runId,
      nodeDefinitionId: NODE_E as any,
      controlState: 'running',
      payload: {
        qualityGatePassed: false,
        detail: {},
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:execute:e'],
      },
    });

    expect(blocked.status).toBe('blocked_review');
    expect(blocked.blockedNodeIds).toEqual([NODE_E]);
    expect(blocked.nodeStates[NODE_E]?.correctionArcs[0]?.type).toBe('reprompt');
    expect(blocked.nodeStates[NODE_D]?.attempts[0]?.outputRef).toBe('transform://revised');
  });
});
