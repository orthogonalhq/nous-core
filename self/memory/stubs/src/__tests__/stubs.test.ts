/**
 * Unit tests for memory stub implementations.
 */
import { describe, it, expect } from 'vitest';
import { NousError } from '@nous/shared';
import {
  StubLtmStore,
  StubDistillationEngine,
  StubRetrievalEngine,
  StubKnowledgeIndex,
  StubAccessPolicy,
} from '../stubs.js';

describe('StubLtmStore', () => {
  const store = new StubLtmStore();

  it('write throws NOT_IMPLEMENTED', async () => {
    await expect(
      store.write({
        id: '00000000-0000-0000-0000-000000000001' as any,
        content: 'test',
        type: 'fact',
        scope: 'project',
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent',
        provenance: {
          traceId: '00000000-0000-0000-0000-000000000002' as any,
          source: 'test',
          timestamp: new Date().toISOString(),
        },
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(NousError);
    await expect(
      store.write({
        id: '00000000-0000-0000-0000-000000000001' as any,
        content: 'test',
        type: 'fact',
        scope: 'project',
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent',
        provenance: {
          traceId: '00000000-0000-0000-0000-000000000002' as any,
          source: 'test',
          timestamp: new Date().toISOString(),
        },
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('read throws NOT_IMPLEMENTED', async () => {
    await expect(
      store.read('00000000-0000-0000-0000-000000000001' as any),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('query throws NOT_IMPLEMENTED', async () => {
    await expect(store.query({})).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('delete throws NOT_IMPLEMENTED', async () => {
    await expect(
      store.delete('00000000-0000-0000-0000-000000000001' as any),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('export throws NOT_IMPLEMENTED', async () => {
    await expect(store.export({})).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('markSuperseded throws NOT_IMPLEMENTED', async () => {
    await expect(
      store.markSuperseded(
        ['00000000-0000-0000-0000-000000000001'] as any,
        '00000000-0000-0000-0000-000000000002' as any,
      ),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('StubDistillationEngine', () => {
  const engine = new StubDistillationEngine();

  it('identifyClusters throws NOT_IMPLEMENTED', async () => {
    await expect(engine.identifyClusters()).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('distill throws NOT_IMPLEMENTED', async () => {
    await expect(
      engine.distill({ records: [], clusterKey: 'test' }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('runDistillationPass throws NOT_IMPLEMENTED', async () => {
    await expect(engine.runDistillationPass()).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

describe('StubRetrievalEngine', () => {
  const engine = new StubRetrievalEngine();

  it('retrieve throws NOT_IMPLEMENTED', async () => {
    await expect(
      engine.retrieve({ situation: 'test', tokenBudget: 100 }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('StubKnowledgeIndex', () => {
  const index = new StubKnowledgeIndex();
  const projectId = '00000000-0000-0000-0000-000000000001' as any;

  it('updateMetaVector throws NOT_IMPLEMENTED', async () => {
    await expect(index.updateMetaVector(projectId)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('discoverProjects throws NOT_IMPLEMENTED', async () => {
    await expect(index.discoverProjects('test')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

describe('StubAccessPolicy', () => {
  const policy = new StubAccessPolicy();
  const projectId = '00000000-0000-0000-0000-000000000001' as any;

  it('canRead throws NOT_IMPLEMENTED', async () => {
    await expect(
      policy.canRead(projectId, '00000000-0000-0000-0000-000000000002' as any),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('inheritsGlobal throws NOT_IMPLEMENTED', async () => {
    await expect(policy.inheritsGlobal(projectId)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('getPolicy throws NOT_IMPLEMENTED', async () => {
    await expect(policy.getPolicy(projectId)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});
