import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { ValidationError } from '@nous/shared';
import { SqliteDocumentStore } from '../sqlite-document-store.js';

const TEST_DIR = join(tmpdir(), 'nous-storage-test-' + Date.now());
let store: SqliteDocumentStore;
let dbPath: string;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  dbPath = join(TEST_DIR, `test-${Date.now()}.db`);
  store = new SqliteDocumentStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('SqliteDocumentStore', () => {
  // --- Tier 1: Contract tests ---

  describe('put() and get()', () => {
    it('round-trips a JSON document', async () => {
      const doc = { name: 'test', value: 42 };
      await store.put('items', 'doc-1', doc);
      const result = await store.get('items', 'doc-1');
      expect(result).toEqual(doc);
    });
  });

  describe('get()', () => {
    it('returns null for non-existent document', async () => {
      const result = await store.get('items', 'no-such-id');
      expect(result).toBeNull();
    });

    it('returns null for wrong collection (same id, different collection)', async () => {
      await store.put('collection-a', 'id-1', { data: 'a' });
      const result = await store.get('collection-b', 'id-1');
      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('returns true when document exists', async () => {
      await store.put('items', 'doc-1', { value: 1 });
      const result = await store.delete('items', 'doc-1');
      expect(result).toBe(true);
    });

    it('returns false when document does not exist', async () => {
      const result = await store.delete('items', 'no-such-id');
      expect(result).toBe(false);
    });
  });

  describe('query()', () => {
    it('returns empty array for empty collection', async () => {
      const result = await store.query('empty', {});
      expect(result).toEqual([]);
    });

    it('returns documents matching where clause', async () => {
      await store.put('items', '1', { status: 'active', name: 'a' });
      await store.put('items', '2', { status: 'inactive', name: 'b' });
      await store.put('items', '3', { status: 'active', name: 'c' });

      const result = await store.query('items', {
        where: { status: 'active' },
      });
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'a' }),
          expect.objectContaining({ name: 'c' }),
        ]),
      );
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await store.put('items', `doc-${i}`, { index: i });
      }

      const result = await store.query('items', {
        orderBy: 'index',
        limit: 2,
        offset: 1,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ index: 1 });
      expect(result[1]).toEqual({ index: 2 });
    });

    it('respects orderBy and orderDirection', async () => {
      await store.put('items', '1', { name: 'charlie' });
      await store.put('items', '2', { name: 'alpha' });
      await store.put('items', '3', { name: 'bravo' });

      const asc = await store.query<{ name: string }>('items', {
        orderBy: 'name',
        orderDirection: 'asc',
      });
      expect(asc.map((d) => d.name)).toEqual(['alpha', 'bravo', 'charlie']);

      const desc = await store.query<{ name: string }>('items', {
        orderBy: 'name',
        orderDirection: 'desc',
      });
      expect(desc.map((d) => d.name)).toEqual(['charlie', 'bravo', 'alpha']);
    });
  });

  // --- Tier 2: Behavior tests ---

  describe('upsert behavior', () => {
    it('overwrites existing document with same collection and id', async () => {
      await store.put('items', 'doc-1', { version: 1 });
      await store.put('items', 'doc-1', { version: 2 });
      const result = await store.get('items', 'doc-1');
      expect(result).toEqual({ version: 2 });
    });

    it('preserves created_at on overwrite (only updated_at changes)', async () => {
      await store.put('items', 'doc-1', { value: 'first' });

      // Read created_at directly from SQLite
      const db = new Database(dbPath);
      const before = db.prepare(
        "SELECT created_at, updated_at FROM documents WHERE collection = 'items' AND id = 'doc-1'",
      ).get() as { created_at: string; updated_at: string };

      // Small delay to ensure timestamps differ
      await new Promise((r) => setTimeout(r, 50));

      await store.put('items', 'doc-1', { value: 'second' });

      const after = db.prepare(
        "SELECT created_at, updated_at FROM documents WHERE collection = 'items' AND id = 'doc-1'",
      ).get() as { created_at: string; updated_at: string };

      db.close();

      expect(after.created_at).toBe(before.created_at);
      expect(after.updated_at).not.toBe(before.updated_at);
    });
  });

  describe('query behavior', () => {
    it('with multiple where conditions applies AND logic', async () => {
      await store.put('items', '1', { status: 'active', type: 'a' });
      await store.put('items', '2', { status: 'active', type: 'b' });
      await store.put('items', '3', { status: 'inactive', type: 'a' });

      const result = await store.query('items', {
        where: { status: 'active', type: 'a' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ status: 'active', type: 'a' }),
      );
    });

    it('excludes documents with missing fields in where clause', async () => {
      await store.put('items', '1', { status: 'active' });
      await store.put('items', '2', { name: 'no-status' });

      const result = await store.query('items', {
        where: { status: 'active' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('namespace isolation', () => {
    it('documents in "projectA:items" are isolated from "projectB:items"', async () => {
      await store.put('projectA:items', 'doc-1', { project: 'A' });
      await store.put('projectB:items', 'doc-1', { project: 'B' });

      const a = await store.get('projectA:items', 'doc-1');
      const b = await store.get('projectB:items', 'doc-1');

      expect(a).toEqual({ project: 'A' });
      expect(b).toEqual({ project: 'B' });
    });
  });

  describe('initialization', () => {
    it('database auto-initializes on construction (tables exist)', async () => {
      const db = new Database(dbPath);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'",
        )
        .all();
      db.close();
      expect(tables).toHaveLength(1);
    });
  });

  describe('lifecycle', () => {
    it('close() closes the database connection', () => {
      store.close();
      expect(() => {
        store['db'].prepare('SELECT 1');
      }).toThrow();
    });
  });

  // --- Tier 3: Edge case tests ---

  describe('edge cases', () => {
    it('query() throws ValidationError for invalid field name in where clause', async () => {
      await expect(
        store.query('items', { where: { 'DROP TABLE; --': 'malicious' } }),
      ).rejects.toThrow(ValidationError);
    });

    it('query() throws ValidationError for invalid field name in orderBy', async () => {
      await expect(
        store.query('items', { orderBy: 'DROP TABLE; --' }),
      ).rejects.toThrow(ValidationError);
    });

    it('put() handles documents with nested objects and arrays', async () => {
      const doc = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        tags: ['a', 'b'],
      };
      await store.put('items', 'complex', doc);
      const result = await store.get('items', 'complex');
      expect(result).toEqual(doc);
    });

    it('put() handles documents with null values', async () => {
      const doc = { name: 'test', optional: null };
      await store.put('items', 'nullable', doc);
      const result = await store.get('items', 'nullable');
      expect(result).toEqual(doc);
    });
  });
});
