import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import { afterEach } from 'vitest';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { DeterministicWorkflowEngine } from '../workflow-engine.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440501';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440502';
const NODE_A = '550e8400-e29b-41d4-a716-446655440503';
const NODE_B = '550e8400-e29b-41d4-a716-446655440504';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440505';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440506';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440508';
const TRIGGER_ID = '550e8400-e29b-41d4-a716-446655440509';
const BOUND_WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440512';

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
              outputSchemaRef: 'schema://node-output/draft',
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
    packageBindings: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

async function createInstanceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'nous-workflow-engine-'));
  tempRoots.push(root);
  await Promise.all([
    mkdir(join(root, '.apps'), { recursive: true }),
    mkdir(join(root, '.skills'), { recursive: true }),
    mkdir(join(root, '.workflows'), { recursive: true }),
    mkdir(join(root, '.projects'), { recursive: true }),
    mkdir(join(root, '.contracts'), { recursive: true }),
  ]);
  return root;
}

async function writeInstalledWorkflow(instanceRoot: string) {
  const packageRoot = join(
    instanceRoot,
    '.workflows',
    sanitizePackageId('workflow.engine'),
  );
  await mkdir(join(packageRoot, 'steps'), { recursive: true });
  await writeFile(
    join(packageRoot, '.nous-package.json'),
    JSON.stringify({ package_version: '2.0.0' }, null, 2),
  );
  await writeFile(
    join(packageRoot, 'WORKFLOW.md'),
    `---
name: engine-workflow
description: Engine workflow package.
entrypoint: draft
---

# Workflow
`,
  );
  await writeFile(
    join(packageRoot, 'nous.flow.yaml'),
    `nous:
  v: 1
flow:
  id: engine-workflow
  mode: graph
  entry_step: draft
  steps:
    - id: draft
      file: steps/draft.md
      next: ["review"]
    - id: review
      file: steps/review.md
      next: []
`,
  );
  await writeFile(
    join(packageRoot, 'steps', 'draft.md'),
    `---
nous:
  v: 1
  kind: workflow_step
  id: draft
name: Draft
type: model-call
governance: must
executionModel: synchronous
config:
  type: model-call
  modelRole: reasoner
  promptRef: prompt://draft
---

# Draft
`,
  );
  await writeFile(
    join(packageRoot, 'steps', 'review.md'),
    `---
nous:
  v: 1
  kind: workflow_step
  id: review
name: Review
type: quality-gate
governance: must
executionModel: synchronous
config:
  type: quality-gate
  evaluatorRef: evaluator://quality
  passThresholdRef: threshold://default
  failureAction: block
---

# Review
`,
  );
}

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

  it('cancels active workflow runs and rejects repeat terminal cancellation', async () => {
    const engine = new DeterministicWorkflowEngine();
    const started = await engine.start({
      projectConfig: projectConfig as any,
      runId: RUN_ID as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    const canceled = await engine.cancel(started.runState.runId, {
      reasonCode: 'workflow_canceled',
      evidenceRefs: ['workflow:cancel'],
    });
    expect(canceled.status).toBe('canceled');
    expect(canceled.activeNodeIds).toEqual([]);
    expect(canceled.readyNodeIds).toEqual([]);

    await expect(
      engine.cancel(started.runState.runId, {
        reasonCode: 'workflow_canceled',
        evidenceRefs: ['workflow:cancel'],
      }),
    ).rejects.toThrow(/cannot be canceled/i);
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

  it('lists project runs newest first and returns the associated run graph', async () => {
    const engine = new DeterministicWorkflowEngine();

    const first = await engine.start({
      projectConfig: projectConfig as any,
      runId: '550e8400-e29b-41d4-a716-446655440510' as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      startedAt: '2026-03-08T00:00:00.000Z',
    });
    const second = await engine.start({
      projectConfig: projectConfig as any,
      runId: '550e8400-e29b-41d4-a716-446655440511' as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      startedAt: '2026-03-08T01:00:00.000Z',
    });

    expect(first.status).toBe('started');
    expect(second.status).toBe('started');
    if (first.status !== 'started' || second.status !== 'started') {
      return;
    }

    const runs = await engine.listProjectRuns(PROJECT_ID as any);
    expect(runs.map((run) => run.runId)).toEqual([
      second.runState.runId,
      first.runState.runId,
    ]);

    const graph = await engine.getRunGraph(second.runState.runId);
    expect(graph?.workflowDefinitionId).toBe(WORKFLOW_ID);
    expect(graph?.projectId).toBe(PROJECT_ID);
  });

  it('returns empty monitoring results for unknown projects and runs', async () => {
    const engine = new DeterministicWorkflowEngine();

    expect(
      await engine.listProjectRuns(
        '550e8400-e29b-41d4-a716-446655440599' as any,
      ),
    ).toEqual([]);
    expect(
      await engine.getRunGraph(
        '550e8400-e29b-41d4-a716-446655440598' as any,
      ),
    ).toBeNull();
  });

  it('resolves installed workflow definitions from project bindings and reports source metadata', async () => {
    const instanceRoot = await createInstanceRoot();
    await writeInstalledWorkflow(instanceRoot);
    const runtime = new NodeRuntime();
    const engine = new DeterministicWorkflowEngine({
      runtime,
      instanceRoot,
    });
    const boundProjectConfig = {
      ...projectConfig,
      workflow: {
        definitions: [],
        packageBindings: [
          {
            workflowDefinitionId: BOUND_WORKFLOW_ID,
            workflowPackageId: 'workflow.engine',
            workflowPackageVersion: '2.0.0',
            entrypoint: 'draft',
            boundAt: '2026-03-16T18:00:00.000Z',
            manifestRef: '.workflows/workflow__engine/WORKFLOW.md',
          },
        ],
        defaultWorkflowDefinitionId: BOUND_WORKFLOW_ID,
      },
    };

    const definition = await engine.resolveDefinition(boundProjectConfig as any);
    const source = await engine.resolveDefinitionSource(boundProjectConfig as any);

    expect(definition.id).toBe(BOUND_WORKFLOW_ID);
    expect(definition.entryNodeIds).toHaveLength(1);
    expect(definition.entryNodeIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(source?.sourceKind).toBe('installed_package');
    expect(source?.packageId).toBe('workflow.engine');
  });

  it('blocks start when a bound installed workflow definition cannot be resolved', async () => {
    const runtime = new NodeRuntime();
    const engine = new DeterministicWorkflowEngine({
      runtime,
      instanceRoot: process.cwd(),
    });
    const boundProjectConfig = {
      ...projectConfig,
      workflow: {
        definitions: [],
        packageBindings: [
          {
            workflowDefinitionId: BOUND_WORKFLOW_ID,
            workflowPackageId: 'workflow.missing',
            workflowPackageVersion: '9.9.9',
            entrypoint: 'draft',
            boundAt: '2026-03-16T18:00:00.000Z',
            manifestRef: '.workflows/workflow__missing/WORKFLOW.md',
          },
        ],
        defaultWorkflowDefinitionId: BOUND_WORKFLOW_ID,
      },
    };

    const started = await engine.start({
      projectConfig: boundProjectConfig as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
    });

    expect(started.status).toBe('admission_blocked');
    if (started.status === 'admission_blocked') {
      expect(started.admission.reasonCode).toBe('workflow_definition_unavailable');
    }
  });
});
