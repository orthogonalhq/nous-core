import { mkdir, writeFile } from 'node:fs/promises';
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
import { TRPCError } from '@trpc/server';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import {
  createProjectConfig,
  createScheduleUpsertInput,
} from '../../test-support/project-fixtures';

const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441002' as WorkflowDefinitionId;
const NODE_A = '550e8400-e29b-41d4-a716-446655441003' as WorkflowNodeDefinitionId;
const NODE_B = '550e8400-e29b-41d4-a716-446655441004' as WorkflowNodeDefinitionId;
const EDGE_ID = '550e8400-e29b-41d4-a716-446655441006' as WorkflowEdgeId;
const TRACE_ID = '550e8400-e29b-41d4-a716-446655441005';
const BOUND_WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441100' as WorkflowDefinitionId;

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

async function writeInstalledWorkflowPackage(instanceRoot: string) {
  const packageRoot = join(
    instanceRoot,
    '.workflows',
    sanitizePackageId('workflow.projects-router'),
  );
  await mkdir(join(packageRoot, 'steps'), { recursive: true });
  await writeFile(
    join(packageRoot, '.nous-package.json'),
    JSON.stringify({ package_version: '2.1.0' }, null, 2),
  );
  await writeFile(
    join(packageRoot, 'WORKFLOW.md'),
    `---
name: projects-router-workflow
description: Installed workflow package for router tests.
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
  id: projects-router-workflow
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
        outputSchemaRef: 'schema://projects-workflow/draft-output',
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
  await ctx.projectStore.create(createProjectConfig({
    id: projectId,
    name: `${type} project`,
    type,
    workflow:
      type === 'intent'
        ? undefined
        : {
            defaultWorkflowDefinitionId: WORKFLOW_ID,
            definitions: [createWorkflow(projectId)],
            packageBindings: [],
          },
  }));

  return projectId;
}

describe('projects router', () => {
  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-projects-router-${randomUUID()}`);
    process.env.NOUS_INSTANCE_ROOT = join(
      tmpdir(),
      `nous-projects-router-instance-${randomUUID()}`,
    );
    await Promise.all([
      mkdir(join(process.env.NOUS_INSTANCE_ROOT, '.apps'), { recursive: true }),
      mkdir(join(process.env.NOUS_INSTANCE_ROOT, '.skills'), { recursive: true }),
      mkdir(join(process.env.NOUS_INSTANCE_ROOT, '.workflows'), { recursive: true }),
      mkdir(join(process.env.NOUS_INSTANCE_ROOT, '.projects'), { recursive: true }),
      mkdir(join(process.env.NOUS_INSTANCE_ROOT, '.contracts'), { recursive: true }),
    ]);
    await writeInstalledWorkflowPackage(process.env.NOUS_INSTANCE_ROOT);
    clearNousContextCache();
  });

  it('returns a live dashboard snapshot with canonical workflow, schedule, and escalation truth', async () => {
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

    await ctx.schedulerService.upsert(createScheduleUpsertInput({
      projectId,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
    }));
    await ctx.escalationService.notify({
      context: 'Workflow blocked on review',
      triggerReason: 'review_required',
      requiredAction: 'Review and resume',
      channel: 'in-app',
      projectId,
      priority: 'high',
      timestamp: '2026-03-09T19:05:00.000Z',
    });

    const dashboard = await caller.projects.dashboardSnapshot({ projectId });
    const visualDebug = await caller.projects.workflowVisualDebugSnapshot({ projectId });
    const nodeInspect = await caller.projects.workflowNodeInspect({
      projectId,
      runId: started.runState.runId,
      nodeDefinitionId: NODE_A,
    });

    expect(dashboard.workflowSnapshot?.runtimeAvailability).toBe('live');
    expect(dashboard.schedules).toHaveLength(1);
    expect(dashboard.openEscalations).toHaveLength(1);
    expect(dashboard.health.enabledScheduleCount).toBe(1);
    expect(dashboard.controlProjection?.project_id).toBe(projectId);
    expect(visualDebug.stages.length).toBeGreaterThan(0);
    expect(visualDebug.canvasNodes.some((node) => node.nodeDefinitionId === NODE_A)).toBe(true);
    expect(visualDebug.schedulerSummary.enabledScheduleCount).toBe(1);
    expect(visualDebug.diagnostics.graphProjectionParity).toBe('aligned');
    expect(nodeInspect.monitor.nodeDefinitionId).toBe(NODE_A);
    expect(nodeInspect.artifactRefs[0]).toMatch(/^artifact:\/\//);
  });

  it('returns configuration snapshots and persists governed configuration and schedule updates', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);

    const snapshot = await caller.projects.configurationSnapshot({ projectId });
    expect(snapshot.fieldProvenance.some((entry) => entry.field === 'memoryAccessPolicy')).toBe(
      true,
    );

    const updated = await caller.projects.updateConfiguration({
      projectId,
      expectedUpdatedAt: snapshot.updatedAt,
      updates: {
        type: 'protocol',
        governanceDefaults: {
          defaultNodeGovernance: 'should',
          requireExplicitReviewForShouldDeviation: true,
          blockedActionFeedbackMode: 'reason_coded',
        },
        memoryAccessPolicy: {
          canReadFrom: 'none',
          canBeReadBy: 'all',
          inheritsGlobal: false,
        },
        retrievalBudgetTokens: 750,
      },
    });

    expect(updated.config.type).toBe('protocol');
    expect(updated.config.memoryAccessPolicy.canReadFrom).toBe('none');

    const schedule = await caller.projects.upsertSchedule({
      projectId,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '30 * * * *',
      },
      enabled: true,
    });
    expect(schedule.trigger).toEqual({
      kind: 'cron',
      cron: '30 * * * *',
    });
  });

  it('blocks configuration edits when the project control state is hard stopped', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);

    ctx.opctlService.getProjectControlState = async () => 'hard_stopped';

    const snapshot = await caller.projects.configurationSnapshot({ projectId });
    expect(
      snapshot.blockedActions.some(
        (action) =>
          action.action === 'edit_project_configuration' && !action.allowed,
      ),
    ).toBe(true);

    await expect(
      caller.projects.updateConfiguration({
        projectId,
        updates: {
          pfcTier: 4,
        },
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>);
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

  it('surfaces installed workflow binding metadata without copying installed definitions into project config', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({
      id: projectId,
      name: 'bound project',
      workflow: {
        definitions: [],
        packageBindings: [
          {
            workflowDefinitionId: BOUND_WORKFLOW_ID,
            workflowPackageId: 'workflow.projects-router',
            workflowPackageVersion: '2.1.0',
            entrypoint: 'draft',
            boundAt: '2026-03-16T18:00:00.000Z',
            manifestRef: '.workflows/workflow__projects-router/WORKFLOW.md',
          },
        ],
        defaultWorkflowDefinitionId: BOUND_WORKFLOW_ID,
      },
    }));

    const snapshot = await caller.projects.workflowSnapshot({ projectId });
    expect(snapshot.workflowDefinition?.id).toBe(BOUND_WORKFLOW_ID);
    expect(snapshot.workflowDefinitionSource?.sourceKind).toBe('installed_package');

    const saved = await caller.projects.saveWorkflowDefinition({
      projectId,
      workflowDefinition: createWorkflow(projectId, '1.1.0'),
      setAsDefault: false,
    });

    expect(saved.project.workflow?.definitions).toHaveLength(1);
    expect(saved.project.workflow?.packageBindings).toHaveLength(1);
    expect(saved.project.workflow?.definitions.some((definition) =>
      definition.id === BOUND_WORKFLOW_ID
    )).toBe(false);
  });

  it('marks visual-debug parity degraded when the run graph is unavailable', async () => {
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

    ctx.workflowEngine.getRunGraph = async () => null;

    const visualDebug = await caller.projects.workflowVisualDebugSnapshot({ projectId });

    expect(visualDebug.runtimeAvailability).toBe('degraded_runtime_unavailable');
    expect(visualDebug.diagnostics.graphProjectionParity).toBe('degraded');
  });
});
