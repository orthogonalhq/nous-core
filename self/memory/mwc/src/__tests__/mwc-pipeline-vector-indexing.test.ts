import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { IVectorStore } from '@nous/shared';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryVectorStore, SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentStmStore } from '@nous/memory-stm';
import { MwcPipeline, createStubEvaluator } from '../index.js';

const MODEL_HASH = 'a'.repeat(64);

describe('MwcPipeline vector indexing', () => {
  it('indexes approved entries with provenance metadata and embedding vector', async () => {
    const dbPath = join(tmpdir(), `nous-mwc-vector-${randomUUID()}.sqlite`);
    const projectId = randomUUID();
    const traceId = randomUUID();

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore);
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder(32);

    const pipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createStubEvaluator(),
      undefined,
      {
        vectorIndexing: {
          vectorStore,
          embedder,
          profile: {
            modelId: 'nous-test-embedder',
            modelVersion: '1.0.0',
            modelHash: MODEL_HASH,
            provider: 'test',
            dimensions: 32,
          },
        },
      },
    );

    const candidate = {
      content: 'User prefers concise responses',
      type: 'preference' as const,
      scope: 'project' as const,
      projectId: projectId as any,
      confidence: 0.9,
      sensitivity: [],
      retention: 'permanent' as const,
      provenance: {
        traceId: traceId as any,
        source: 'model',
        timestamp: new Date().toISOString(),
      },
      tags: ['style'],
    };

    const entryId = await pipeline.submit(candidate, projectId as any);
    expect(entryId).toBeTruthy();

    const query = await embedder.embed(candidate.content);
    const results = await vectorStore.search('memory', query, 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(entryId);
    expect(results[0]!.metadata).toMatchObject({
      memoryEntryId: entryId,
      memoryType: 'preference',
      scope: 'project',
      projectId,
      traceId,
    });

    const metadata = results[0]!.metadata as Record<string, any>;
    expect(Array.isArray(metadata.evidenceRefs)).toBe(true);
    expect(metadata.evidenceRefs[0]).toMatchObject({
      actionCategory: 'memory-write',
    });
    expect(metadata.embedding.profile.modelId).toBe('nous-test-embedder');

    const entries = await pipeline.listForProject(projectId as any);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.embedding).toBeDefined();
    expect(entries[0]!.embedding).toHaveLength(32);
  });

  it('fails closed when vector upsert fails (entry is not persisted)', async () => {
    const dbPath = join(
      tmpdir(),
      `nous-mwc-vector-failclose-${randomUUID()}.sqlite`,
    );
    const projectId = randomUUID();
    const traceId = randomUUID();

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore);
    const embedder = new InMemoryEmbedder(16);

    const failingVectorStore: IVectorStore = {
      async upsert(): Promise<void> {
        throw new Error('vector backend unavailable');
      },
      async search(): Promise<any[]> {
        return [];
      },
      async delete(): Promise<boolean> {
        return false;
      },
    };

    const pipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createStubEvaluator(),
      undefined,
      {
        vectorIndexing: {
          vectorStore: failingVectorStore,
          embedder,
          profile: {
            modelId: 'nous-test-embedder',
            modelVersion: '1.0.0',
            modelHash: MODEL_HASH,
            provider: 'test',
            dimensions: 16,
          },
        },
      },
    );

    const candidate = {
      content: 'Do not persist if indexing fails',
      type: 'fact' as const,
      scope: 'project' as const,
      projectId: projectId as any,
      confidence: 0.8,
      sensitivity: [],
      retention: 'permanent' as const,
      provenance: {
        traceId: traceId as any,
        source: 'model',
        timestamp: new Date().toISOString(),
      },
      tags: ['vector'],
    };

    await expect(
      pipeline.submit(candidate, projectId as any),
    ).rejects.toThrow(/vector backend unavailable/i);

    const entries = await pipeline.listForProject(projectId as any);
    expect(entries).toHaveLength(0);

    const audit = await pipeline.listMutationAudit(projectId as any);
    expect(audit).toHaveLength(0);
  });
});

