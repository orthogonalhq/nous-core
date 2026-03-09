import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type {
  ProjectId,
  WorkflowDefinition,
  WorkflowDefinitionId,
  WorkflowEdgeId,
  WorkflowNodeDefinitionId,
} from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';

const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441002' as WorkflowDefinitionId;
const NODE_A = '550e8400-e29b-41d4-a716-446655441003' as WorkflowNodeDefinitionId;
const NODE_B = '550e8400-e29b-41d4-a716-446655441004' as WorkflowNodeDefinitionId;
const EDGE_ID = '550e8400-e29b-41d4-a716-446655441006' as WorkflowEdgeId;
const TRACE_ID = '550e8400-e29b-41d4-a716-446655441005';

function createWorkflow(projectId: ProjectId, version = '1.0.0'): WorkflowDefinition {
  return {
    id: WORKFLOW_ID,
    projectId,
    mode: 'hybrid' as const,
    version,
    name: 'Projects Workflow',
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
        id: EDGE_ID,
        from: NODE_A,
        to: NODE_B,
        priority: 0,
      },
    ],
  };
}

async function createProjectWithWorkflow(
  ctx: ReturnType<typeof createNousContext>,
  type: 'protocol' | 'intent' | 'hybrid' = 'hybrid',
) {
  const projectId = randomUUID() as ProjectId;
  await ctx.projectStore.create({
    id: projectId,
    name: `${type} project`,
    type,
    pfcTier: 3,
    memoryAccessPolicy: {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    },
    escalationChannels: ['in-app'],
    workflow:
      type === 'intent'
        ? undefined
        : {
            defaultWorkflowDefinitionId: WORKFLOW_ID,
            definitions: [createWorkflow(projectId)],
          },
    retrievalBudgetTokens: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return projectId;
}

describe('projects router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-projects-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('returns a live workflow snapshot with canonical artifacts and traces', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);

    const started = await ctx.workflowEngine.start({
      projectConfig: (await ctx.projectStore.get(projectId))!,
      runId: randomUUID() as any,
      workmodeId: 'system:implementation',
      sourceActor: 'orchestration_agent',
      controlState: 'running',
      startedAt: '2026-03-09T19:00:00.000Z',
    });
    expect(started.status).toBe('started');
    if (started.status !== 'started') {
      return;
    }

    await ctx.artifactStore.store({
      projectId,
      name: 'draft.md',
      mimeType: 'text/markdown',
      data: '# Draft',
      contentEncoding: 'utf8',
      lineage: {
        workflowRunId: started.runState.runId,
        workflowDefinitionId: WORKFLOW_ID,
        workflowNodeDefinitionId: NODE_A,
        dispatchLineageId: started.runState.nodeStates[NODE_A]?.lastDispatchLineageId,
        evidenceRefs: [],
      },
      tags: ['draft'],
    });

    await ctx.documentStore.put('execution_traces', TRACE_ID, {
      traceId: TRACE_ID,
      projectId,
      startedAt: '2026-03-09T19:01:00.000Z',
      completedAt: '2026-03-09T19:02:00.000Z',
      turns: [
        {
          input: 'Run workflow',
          output: 'Completed',
          modelCalls: [],
          pfcDecisions: [],
          toolDecisions: [],
          memoryWrites: [],
          memoryDenials: [],
          evidenceRefs: [],
          timestamp: '2026-03-09T19:01:30.000Z',
        },
      ],
    });

    const snapshot = await caller.projects.workflowSnapshot({ projectId });

    expect(snapshot.runtimeAvailability).toBe('live');
    expect(snapshot.activeRunState?.runId).toBe(started.runState.runId);
    expect(snapshot.nodeProjections[0]?.artifactRefs.length).toBe(1);
    expect(snapshot.recentTraces[0]?.traceId).toBe(TRACE_ID);
    expect(snapshot.controlProjection?.project_id).toBe(projectId);
  });

  it('returns structured validation issues and persists valid workflow updates', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);

    const invalid = await caller.projects.validateWorkflowDefinition({
      projectId,
      workflowDefinition: {
        ...createWorkflow(randomUUID() as ProjectId),
        entryNodeIds: ['550e8400-e29b-41d4-a716-446655441099'] as any,
      },
    });

    expect(invalid.valid).toBe(false);
    expect(
      invalid.issues.some((issue) =>
        [
          'workflow_definition_project_mismatch',
          'workflow_entry_node_missing',
        ].includes(issue.code),
      ),
    ).toBe(true);

    const saveResult = await caller.projects.saveWorkflowDefinition({
      projectId,
      workflowDefinition: createWorkflow(projectId, '1.0.1'),
      setAsDefault: true,
    });

    expect(saveResult.validation.valid).toBe(true);
    expect(
      saveResult.project.workflow?.definitions.find((definition) => definition.id === WORKFLOW_ID)
        ?.version,
    ).toBe('1.0.1');
  });

  it('preserves inspect-first no-definition posture for intent projects', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx, 'intent');

    const snapshot = await caller.projects.workflowSnapshot({ projectId });

    expect(snapshot.workflowDefinition).toBeNull();
    expect(snapshot.graph).toBeNull();
    expect(snapshot.runtimeAvailability).toBe('no_active_run');
    expect(snapshot.diagnostics.inspectFirstMode).toBe('no-definition');
  });
});
