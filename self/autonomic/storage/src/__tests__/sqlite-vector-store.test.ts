import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ValidationError } from '@nous/shared';
import { SqliteVectorStore } from '../sqlite-vector-store.js';

const TEST_DIR = join(tmpdir(), 'nous-vector-store-test-' + Date.now());

let store: SqliteVectorStore;
let dbPath: string;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  dbPath = join(TEST_DIR, `test-${Date.now()}.db`);
  store = new SqliteVectorStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('SqliteVectorStore', () => {
  it('upsert() + search() round-trip a vector result', async () => {
    await store.upsert(
      'memory',
      'entry-1',
      [1, 0, 0],
      { projectId: 'p-1', scope: 'project' },
    );

    const results = await store.search('memory', [1, 0, 0], 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'entry-1',
      metadata: { projectId: 'p-1', scope: 'project' },
    });
    expect(results[0]!.score).toBeGreaterThanOrEqual(0);
    expect(results[0]!.score).toBeLessThanOrEqual(1);
  });

  it('search() applies metadata filter matching', async () => {
    await store.upsert('memory', 'a', [1, 0], { projectId: 'p-1' });
    await store.upsert('memory', 'b', [1, 0], { projectId: 'p-2' });

    const filtered = await store.search(
      'memory',
      [1, 0],
      10,
      { where: { projectId: 'p-2' } },
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe('b');
  });

  it('search() sorts by score desc then id asc deterministically', async () => {
    const vector = [1, 0];
    await store.upsert('memory', 'z', vector, {});
    await store.upsert('memory', 'a', vector, {});
    await store.upsert('memory', 'm', vector, {});

    const results = await store.search('memory', vector, 10);
    expect(results.map((item) => item.id)).toEqual(['a', 'm', 'z']);
  });

  it('delete() returns true for existing id and false for missing id', async () => {
    await store.upsert('memory', 'entry-1', [1, 0], {});

    expect(await store.delete('memory', 'entry-1')).toBe(true);
    expect(await store.delete('memory', 'entry-1')).toBe(false);
  });

  it('search() returns empty when query dimensions differ', async () => {
    await store.upsert('memory', 'entry-1', [1, 0], {});

    const results = await store.search('memory', [1, 0, 0], 10);
    expect(results).toEqual([]);
  });

  it('upsert() rejects non-finite vectors', async () => {
    await expect(
      store.upsert('memory', 'bad', [NaN], {}),
    ).rejects.toThrow(ValidationError);
  });
});

