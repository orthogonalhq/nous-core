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
          modelRole: 'cortex-chat' as const,
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

  // -------------------------------------------------------------------------
  // saveWorkflowSpec / listWorkflowDefinitions / getWorkflowDefinition / deleteWorkflowDefinition
  // -------------------------------------------------------------------------

  const VALID_SPEC_YAML = `
name: Test Workflow
version: 1
nodes:
  - id: draft-step
    name: Draft
    type: nous.agent.orchestrator
    position: [0, 0]
    parameters: {}
connections: []
`.trim();

  const VALID_SPEC_YAML_V2 = `
name: Updated Workflow
version: 1
nodes:
  - id: review-step
    name: Review
    type: nous.agent.orchestrator
    position: [100, 100]
    parameters: {}
connections: []
`.trim();

  it('saveWorkflowSpec creates a new definition from valid spec YAML', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'spec project' }));

    const result = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    expect(result.definitionId).toBeTruthy();
    expect(result.validation.valid).toBe(true);

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.definitions).toHaveLength(1);
    expect(project?.workflow?.definitions[0]?.id).toBe(result.definitionId);
  });

  it('saveWorkflowSpec rejects invalid YAML', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'bad yaml' }));

    await expect(
      caller.projects.saveWorkflowSpec({
        projectId,
        specYaml: '{ invalid yaml: [',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('saveWorkflowSpec rejects spec that fails schema validation', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'bad spec' }));

    // Valid YAML but missing required spec fields
    await expect(
      caller.projects.saveWorkflowSpec({
        projectId,
        specYaml: 'name: Missing fields\n',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('saveWorkflowSpec upserts existing definition by definitionId', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'upsert project' }));

    const first = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    const second = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML_V2,
      definitionId: first.definitionId,
    });

    expect(second.definitionId).toBe(first.definitionId);

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.definitions).toHaveLength(1);
    expect(project?.workflow?.definitions[0]?.name).toBe('Updated Workflow');
  });

  it('saveWorkflowSpec stores and round-trips specYaml', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'roundtrip' }));

    const saved = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    const loaded = await caller.projects.getWorkflowDefinition({
      projectId,
      definitionId: saved.definitionId,
    });

    expect(loaded.specYaml).toBe(VALID_SPEC_YAML);
  });

  it('saveWorkflowSpec with setAsDefault: true sets default', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'default project' }));

    const result = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
      setAsDefault: true,
    });

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.defaultWorkflowDefinitionId).toBe(result.definitionId);
  });

  it('saveWorkflowSpec with name override uses provided name', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'name override' }));

    await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
      name: 'Custom Name',
    });

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.definitions[0]?.name).toBe('Custom Name');
  });

  it('saveWorkflowSpec with definitionId that does not exist creates with that ID', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    const customId = randomUUID();
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'custom id' }));

    const result = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
      definitionId: customId,
    });

    expect(result.definitionId).toBe(customId);
  });

  it('saveWorkflowSpec preserves existing packageBindings', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({
      id: projectId,
      name: 'bindings project',
      workflow: {
        definitions: [],
        packageBindings: [
          {
            workflowDefinitionId: BOUND_WORKFLOW_ID,
            workflowPackageId: 'workflow.test-pkg',
            workflowPackageVersion: '1.0.0',
            entrypoint: 'start',
            boundAt: '2026-03-16T18:00:00.000Z',
            manifestRef: '.workflows/test/WORKFLOW.md',
          },
        ],
      },
    }));

    await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.packageBindings).toHaveLength(1);
  });

  it('listWorkflowDefinitions returns summaries', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'list project' }));

    await caller.projects.saveWorkflowSpec({ projectId, specYaml: VALID_SPEC_YAML });
    await caller.projects.saveWorkflowSpec({ projectId, specYaml: VALID_SPEC_YAML_V2 });

    const list = await caller.projects.listWorkflowDefinitions({ projectId });
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('version');
    expect(list[0]).toHaveProperty('isDefault');
  });

  it('listWorkflowDefinitions returns empty array for project with no definitions', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'empty project' }));

    const list = await caller.projects.listWorkflowDefinitions({ projectId });
    expect(list).toEqual([]);
  });

  it('getWorkflowDefinition returns full definition with specYaml', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'get project' }));

    const saved = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    const definition = await caller.projects.getWorkflowDefinition({
      projectId,
      definitionId: saved.definitionId,
    });

    expect(definition.id).toBe(saved.definitionId);
    expect(definition.specYaml).toBe(VALID_SPEC_YAML);
    expect(definition.name).toBeTruthy();
    expect(definition.nodes).toBeDefined();
  });

  it('getWorkflowDefinition throws NOT_FOUND for unknown ID', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'missing def' }));

    await expect(
      caller.projects.getWorkflowDefinition({
        projectId,
        definitionId: 'nonexistent-id',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('deleteWorkflowDefinition removes definition', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'delete project' }));

    const saved = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
    });

    const result = await caller.projects.deleteWorkflowDefinition({
      projectId,
      definitionId: saved.definitionId,
    });

    expect(result.deleted).toBe(true);

    const list = await caller.projects.listWorkflowDefinitions({ projectId });
    expect(list).toHaveLength(0);
  });

  it('deleteWorkflowDefinition clears default when deleting default definition', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'clear default' }));

    const saved = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
      setAsDefault: true,
    });

    await caller.projects.deleteWorkflowDefinition({
      projectId,
      definitionId: saved.definitionId,
    });

    const project = await ctx.projectStore.get(projectId);
    expect(project?.workflow?.defaultWorkflowDefinitionId).toBeUndefined();
  });

  it('deleteWorkflowDefinition returns deleted: false for non-existent ID', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'no-op delete' }));

    const result = await caller.projects.deleteWorkflowDefinition({
      projectId,
      definitionId: 'nonexistent-id',
    });

    expect(result.deleted).toBe(false);
  });

  it('deleteWorkflowDefinition does not affect other definitions', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({ id: projectId, name: 'multi delete' }));

    const first = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML,
      setAsDefault: false,
    });
    const second = await caller.projects.saveWorkflowSpec({
      projectId,
      specYaml: VALID_SPEC_YAML_V2,
      setAsDefault: false,
    });

    await caller.projects.deleteWorkflowDefinition({
      projectId,
      definitionId: first.definitionId,
    });

    const list = await caller.projects.listWorkflowDefinitions({ projectId });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(second.definitionId);
  });

  it('existing saveWorkflowDefinition still works (backward compatibility)', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProjectWithWorkflow(ctx);

    const result = await caller.projects.saveWorkflowDefinition({
      projectId,
      workflowDefinition: createWorkflow(projectId, '2.0.0'),
      setAsDefault: true,
    });

    expect(result.validation.valid).toBe(true);
    expect(result.project.workflow?.definitions).toHaveLength(1);
    expect(result.project.workflow?.definitions[0]?.version).toBe('2.0.0');
  });
});
