import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { ProjectId } from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

describe('mobile router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-mobile-router-${randomUUID()}`);
    clearNousContextCache();
  });

  async function createProject(ctx: ReturnType<typeof createNousContext>) {
    const projectId = randomUUID() as ProjectId;
    await ctx.projectStore.create(
      createProjectConfig({
        id: projectId,
        name: 'Mobile Router Project',
      }),
    );
    return projectId;
  }

  it('builds a mobile snapshot from canonical dashboard, queue, voice, and trust services', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProject(ctx);

    await ctx.escalationService.notify({
      context: 'Mobile router escalation',
      triggerReason: 'test',
      requiredAction: 'Inspect mobile queue',
      channel: 'in-app',
      projectId,
      priority: 'critical',
      timestamp: '2026-03-09T20:00:00.000Z',
    });

    const pairing = await ctx.endpointTrustService.requestPairing({
      peripheral_id: randomUUID(),
      project_id: projectId,
      display_name: 'Mobile headset',
      principal_id: 'principal',
      metadata: {},
      evidence_refs: [],
    });
    await ctx.endpointTrustService.reviewPairing({
      pairing_id: pairing.pairing_id,
      approved: true,
      reviewed_by: 'principal',
      approval_evidence_ref: 'approval:mobile-headset',
      evidence_refs: [],
    });
    const endpoint = await ctx.endpointTrustService.registerEndpoint({
      endpoint_id: randomUUID(),
      peripheral_id: pairing.peripheral_id,
      project_id: projectId,
      display_name: 'Headset capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      metadata: {},
      evidence_refs: [],
    });
    await ctx.endpointTrustService.establishSession({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: endpoint.peripheral_id,
      project_id: projectId,
      established_by: 'principal',
      evidence_refs: [],
      expires_at: '2026-03-11T12:00:00.000Z',
    });

    await caller.voice.beginTurn({
      turn_id: randomUUID(),
      session_id: randomUUID(),
      project_id: projectId,
      principal_id: 'principal',
      channel: 'web',
      evidence_refs: ['voice:mobile'],
    });

    const snapshot = await caller.mobile.operationsSnapshot({ projectId });

    expect(snapshot.project.id).toBe(projectId);
    expect(snapshot.dashboard.project.id).toBe(projectId);
    expect(snapshot.escalationQueue.openCount).toBe(1);
    expect(snapshot.voiceSession?.project_id).toBe(projectId);
    expect(snapshot.endpointTrust?.projectId).toBe(projectId);
    expect(snapshot.endpointTrust?.trustedPeripheralCount).toBe(1);
  });

  it('returns null voice and trust sections when no canonical state exists yet', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await createProject(ctx);

    const snapshot = await caller.mobile.operationsSnapshot({ projectId });

    expect(snapshot.project.id).toBe(projectId);
    expect(snapshot.voiceSession).toBeNull();
    expect(snapshot.endpointTrust).toBeNull();
  });
});
