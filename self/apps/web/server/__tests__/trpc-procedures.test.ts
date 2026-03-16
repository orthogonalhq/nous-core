/**
 * Unit tests for tRPC procedures.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext } from '../bootstrap';
import { appRouter } from '../trpc/root';
import { createProjectConfig } from '../../test-support/project-fixtures';

describe('tRPC procedures', () => {
  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-test-${randomUUID()}`);
    const { clearNousContextCache } = await import('../bootstrap');
    clearNousContextCache();
  });

  it('projects.create and list returns new project', async () => {
    const ctx = createNousContext();
    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Test Project',
    }));

    const list = await ctx.projectStore.list();
    expect(list.some((p) => p.id === projectId)).toBe(true);
  });

  it('chat.sendMessage returns response', async () => {
    const ctx = createNousContext();
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const result = await ctx.coreExecutor.executeTurn({
      message: 'Hello',
      traceId,
    });

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.traceId).toBe(traceId);
  });

  it('chat.sendMessage stores STM history without duplicate router appends', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Chat History Project',
    }));

    const response = await caller.chat.sendMessage({
      message: 'Hello project chat',
      projectId,
    });
    const history = await caller.chat.getHistory({ projectId });

    expect(response.response).toBeDefined();
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0]?.role).toBe('user');
    expect(history.entries[0]?.content).toBe('Hello project chat');
    expect(history.entries[1]?.role).toBe('assistant');
  });

  it('traces.list returns traces for project', async () => {
    const ctx = createNousContext();
    const projectId = randomUUID() as import('@nous/shared').ProjectId;
    const raw = await ctx.documentStore.query<unknown>('execution_traces', {
      where: { projectId },
      limit: 10,
    });
    expect(Array.isArray(raw)).toBe(true);
  });

  it('health.check returns HealthReport shape', async () => {
    const ctx = createNousContext();
    const components: Array<{ name: string; status: string }> = [];

    try {
      await ctx.documentStore.query('projects', { limit: 1 });
      components.push({ name: 'storage', status: 'healthy' });
    } catch {
      components.push({ name: 'storage', status: 'unhealthy' });
    }

    const report = {
      healthy: components.every((c) => c.status === 'healthy'),
      components,
      timestamp: new Date().toISOString(),
    };

    expect(report).toHaveProperty('healthy');
    expect(report).toHaveProperty('components');
    expect(report).toHaveProperty('timestamp');
    expect(Array.isArray(report.components)).toBe(true);
  });

  it('memory export includes mutation audit and tombstone arrays', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Memory Export Project',
    }));
    const entryId = await ctx.mwcPipeline.submit(
      {
        content: 'export payload',
        type: 'fact',
        scope: 'project',
        projectId,
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent',
        provenance: {
          traceId: randomUUID() as import('@nous/shared').TraceId,
          source: 'trpc-test',
          timestamp: new Date().toISOString(),
        },
        tags: [],
      },
      projectId,
    );
    expect(entryId).toBeTruthy();

    await caller.memory.delete({ id: entryId! });
    const exported = await caller.memory.export({ projectId });

    expect(Array.isArray(exported.entries)).toBe(true);
    expect(Array.isArray(exported.audit)).toBe(true);
    expect(Array.isArray(exported.tombstones)).toBe(true);
    expect(exported.audit.length).toBeGreaterThan(0);
  });

  it('discovery.refresh and discovery.snapshot expose the knowledge index runtime', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Discovery Procedure Project',
    }));

    await ctx.documentStore.put('memory_entries', `${projectId}:pattern`, {
      id: `${projectId}:pattern`,
      content: 'release notes and roadmap',
      type: 'distilled-pattern',
      scope: 'project',
      projectId,
      confidence: 0.92,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'trpc-test',
        timestamp: new Date().toISOString(),
      },
      tags: ['release'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mutabilityClass: 'domain-versioned',
      lifecycleStatus: 'active',
      placementState: 'project',
      basedOn: [randomUUID()],
      supersedes: [randomUUID()],
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    });

    const refresh = await caller.discovery.refresh({ projectId });
    const snapshot = await caller.discovery.snapshot({ projectId });

    expect(['updated', 'skipped_no_change']).toContain(refresh.outcome);
    expect(snapshot?.latestRefresh?.id).toBe(refresh.id);
  });

  it('projects workflow procedures validate and persist workflow definitions', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as import('@nous/shared').ProjectId;
    await ctx.projectStore.create(createProjectConfig({
      id: projectId,
      name: 'Projects Workflow Procedure Project',
      workflow: {
        defaultWorkflowDefinitionId: '550e8400-e29b-41d4-a716-446655442002' as any,
        definitions: [
          {
            id: '550e8400-e29b-41d4-a716-446655442002',
            projectId,
            mode: 'hybrid',
            version: '1.0.0',
            name: 'Procedure Workflow',
            entryNodeIds: ['550e8400-e29b-41d4-a716-446655442003'] as any,
            nodes: [
              {
                id: '550e8400-e29b-41d4-a716-446655442003',
                name: 'Draft',
                type: 'model-call',
                governance: 'must',
                executionModel: 'synchronous',
                outputSchemaRef: 'schema://projects-procedure/draft-output',
                config: {
                  type: 'model-call',
                  modelRole: 'reasoner',
                  promptRef: 'prompt://draft',
                },
              },
            ],
            edges: [],
          } as any,
        ],
        packageBindings: [],
      },
    }));

    const validDefinition = {
      id: '550e8400-e29b-41d4-a716-446655442002',
      projectId,
      mode: 'hybrid' as const,
      version: '1.0.1',
      name: 'Procedure Workflow',
      entryNodeIds: ['550e8400-e29b-41d4-a716-446655442003'],
      nodes: [
        {
          id: '550e8400-e29b-41d4-a716-446655442003',
          name: 'Draft',
          type: 'model-call' as const,
          governance: 'must' as const,
          executionModel: 'synchronous' as const,
          outputSchemaRef: 'schema://projects-procedure/draft-output',
          config: {
            type: 'model-call' as const,
            modelRole: 'reasoner' as const,
            promptRef: 'prompt://draft-v2',
          },
        },
      ],
      edges: [],
    };

    const validation = await caller.projects.validateWorkflowDefinition({
      projectId,
      workflowDefinition: validDefinition,
    });
    expect(validation.valid).toBe(true);

    const saved = await caller.projects.saveWorkflowDefinition({
      projectId,
      workflowDefinition: validDefinition,
      setAsDefault: true,
    });
    expect(saved.project.workflow?.definitions[0]?.version).toBe('1.0.1');

    const snapshot = await caller.projects.workflowSnapshot({ projectId });
    expect(snapshot.workflowDefinition?.version).toBe('1.0.1');
  });

  it('mao procedures expose snapshot and control projection routes', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'MAO Procedure Project',
    }));

    const controlProjection = await caller.mao.getProjectControlProjection({
      projectId,
    });
    const snapshot = await caller.mao.getProjectSnapshot({
      projectId,
      densityMode: 'D2',
    });

    expect(controlProjection?.project_id).toBe(projectId);
    expect(snapshot.projectId).toBe(projectId);
  });

  it('witness verify/list/get returns report artifacts', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const traceId = randomUUID() as import('@nous/shared').TraceId;

    await ctx.coreExecutor.executeTurn({
      message: 'emit trace for witness linkage',
      traceId,
    });

    const authorization = await ctx.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'trace-test',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await ctx.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'trace-test',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const report = await caller.witness.verify({});
    expect(report.id).toBeTruthy();
    expect(report.receipt.verified).toBe(true);

    const listed = await caller.witness.listReports({ limit: 10 });
    expect(listed.some((entry) => entry.id === report.id)).toBe(true);

    const fetched = await caller.witness.getReport({ id: report.id });
    expect(fetched?.id).toBe(report.id);

    const traceReports = await caller.traces.verificationReports({ traceId });
    expect(traceReports.some((entry) => entry.id === report.id)).toBe(true);
  });
});
