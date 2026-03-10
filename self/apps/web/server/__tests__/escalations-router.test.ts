import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { ProjectId } from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

describe('escalations router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-escalations-router-${randomUUID()}`);
    clearNousContextCache();
  });

  async function createProject(ctx: ReturnType<typeof createNousContext>) {
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(createProjectConfig({
      id: projectId,
      name: 'Escalations Router Project',
    }));
    return projectId;
  }

  it('lists project-scoped queue items and acknowledges them through the canonical runtime', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProject(ctx);

    const escalationId = await ctx.escalationService.notify({
      context: 'Escalation queue test',
      triggerReason: 'test',
      requiredAction: 'Inspect queue item',
      channel: 'in-app',
      projectId,
      priority: 'critical',
      timestamp: '2026-03-09T20:00:00.000Z',
    });

    const queue = await caller.escalations.listProjectQueue({ projectId });
    expect(queue.items).toHaveLength(1);
    expect(queue.urgentCount).toBe(1);

    const acknowledged = await caller.escalations.acknowledge({
      escalationId,
      surface: 'projects',
      actorType: 'principal',
      note: 'Handled in router test',
    });
    expect(acknowledged.status).toBe('acknowledged');

    const fetched = await caller.escalations.get({ escalationId });
    expect(fetched?.acknowledgements).toHaveLength(1);
  });

  it('returns only project-scoped queue items', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectA = await createProject(ctx);
    const projectB = await createProject(ctx);

    await ctx.escalationService.notify({
      context: 'Project A only',
      triggerReason: 'test',
      requiredAction: 'Inspect queue item',
      channel: 'in-app',
      projectId: projectA,
      priority: 'high',
      timestamp: '2026-03-09T20:00:00.000Z',
    });
    await ctx.escalationService.notify({
      context: 'Project B only',
      triggerReason: 'test',
      requiredAction: 'Inspect queue item',
      channel: 'in-app',
      projectId: projectB,
      priority: 'high',
      timestamp: '2026-03-09T20:05:00.000Z',
    });

    const queue = await caller.escalations.listProjectQueue({ projectId: projectA });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.projectId).toBe(projectA);
  });
});
