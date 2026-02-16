import { describe, it, expect } from 'vitest';
import { NousError } from '@nous/shared';
import { StubVectorStore, StubGraphStore } from '../stubs.js';

describe('StubVectorStore', () => {
  const store = new StubVectorStore();

  it('upsert() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.upsert('coll', 'id', [1, 2], {})).rejects.toThrow(NousError);
    await expect(store.upsert('coll', 'id', [1, 2], {})).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('search() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.search('coll', [1, 2], 10)).rejects.toThrow(NousError);
    await expect(store.search('coll', [1, 2], 10)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('delete() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.delete('coll', 'id')).rejects.toThrow(NousError);
    await expect(store.delete('coll', 'id')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

describe('StubGraphStore', () => {
  const store = new StubGraphStore();

  it('addNode() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.addNode('id', ['label'], {})).rejects.toThrow(NousError);
    await expect(store.addNode('id', ['label'], {})).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('addEdge() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.addEdge('a', 'b', 'rel')).rejects.toThrow(NousError);
    await expect(store.addEdge('a', 'b', 'rel')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('getNeighbors() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.getNeighbors('id')).rejects.toThrow(NousError);
    await expect(store.getNeighbors('id')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('deleteNode() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(store.deleteNode('id')).rejects.toThrow(NousError);
    await expect(store.deleteNode('id')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});
