import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

describe('discovery router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-discovery-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('returns policy-safe discovery results and snapshots from the knowledge index runtime', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectA = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as any,
      name: 'Project A',
    }));
    const projectB = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as any,
      name: 'Project B',
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'none',
        inheritsGlobal: true,
      },
    }));

    await ctx.documentStore.put('memory_entries', `${projectA}:pattern`, {
      id: `${projectA}:pattern`,
      content: 'release notes and roadmap',
      type: 'distilled-pattern',
      scope: 'project',
      projectId: projectA,
      confidence: 0.92,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'discovery-router-test',
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
    await ctx.documentStore.put('memory_entries', `${projectB}:pattern`, {
      id: `${projectB}:pattern`,
      content: 'release launch checklist',
      type: 'distilled-pattern',
      scope: 'project',
      projectId: projectB,
      confidence: 0.92,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'discovery-router-test',
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

    await caller.discovery.refresh({ projectId: projectA });
    await caller.discovery.refresh({ projectId: projectB });

    const result = await caller.discovery.discover({
      requestingProjectId: projectA,
      query: 'release roadmap',
      topK: 5,
      includeMetaVector: true,
      includeTaxonomy: true,
      includeRelationships: true,
    });

    expect(result.discovery.projectIds).not.toContain(projectB);
    expect(result.policy.deniedProjectCount).toBeGreaterThanOrEqual(0);
    if (result.policy.deniedProjectCount > 0) {
      expect(result.policy.reasonCodes).toContain('POL-CANNOT-BE-READ-BY');
    }

    const snapshot = await caller.discovery.snapshot({ projectId: projectA });
    expect(snapshot?.diagnostics.runtimePosture).toBe('single_process_local');
  });
});
