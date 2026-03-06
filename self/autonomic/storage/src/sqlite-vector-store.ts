/**
 * SqliteVectorStore — IVectorStore implementation backed by better-sqlite3.
 *
 * Phase 8.1: Durable vector persistence with deterministic similarity ordering
 * and metadata-based filter support.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  IVectorStore,
  VectorFilter,
  VectorSearchResult,
} from '@nous/shared';
import { ValidationError } from '@nous/shared';

interface StoredVectorRow {
  id: string;
  vector: string;
  metadata: string;
  dimensions: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  const sim = dot / denom;
  return Math.max(0, Math.min(1, (sim + 1) / 2));
}

function assertFiniteVector(name: string, vector: number[]): void {
  if (vector.length === 0) {
    throw new ValidationError(`${name} cannot be empty`, [
      {
        path: name,
        message: `${name} must contain at least one numeric dimension`,
      },
    ]);
  }
  const invalidIndex = vector.findIndex((value) => !Number.isFinite(value));
  if (invalidIndex >= 0) {
    throw new ValidationError(`${name} contains non-finite values`, [
      {
        path: `${name}[${invalidIndex}]`,
        message: `${name} values must be finite numbers`,
      },
    ]);
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} cannot be empty`, [
      { path: name, message: `${name} must be a non-empty string` },
    ]);
  }
}

function serializeMetadata(
  metadata: Record<string, unknown>,
): { json: string; value: Record<string, unknown> } {
  try {
    const json = JSON.stringify(metadata ?? {});
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return { json, value: parsed };
  } catch {
    throw new ValidationError('Metadata must be JSON-serializable', [
      {
        path: 'metadata',
        message: 'Unable to serialize metadata payload',
      },
    ]);
  }
}

function matchesFilter(
  metadata: Record<string, unknown>,
  filter?: VectorFilter,
): boolean {
  if (!filter?.where) return true;
  for (const [key, value] of Object.entries(filter.where)) {
    if (!Object.is(metadata[key], value)) {
      return false;
    }
  }
  return true;
}

export class SqliteVectorStore implements IVectorStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        vector TEXT NOT NULL,
        metadata TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );

      CREATE INDEX IF NOT EXISTS idx_vectors_collection
        ON vectors(collection);

      CREATE INDEX IF NOT EXISTS idx_vectors_dimensions
        ON vectors(collection, dimensions);
    `);
  }

  async upsert(
    collection: string,
    id: string,
    vector: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    assertNonEmpty('collection', collection);
    assertNonEmpty('id', id);
    assertFiniteVector('vector', vector);
    const serializedMetadata = serializeMetadata(metadata);
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO vectors (collection, id, vector, metadata, dimensions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        vector = excluded.vector,
        metadata = excluded.metadata,
        dimensions = excluded.dimensions,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      collection,
      id,
      JSON.stringify(vector),
      serializedMetadata.json,
      vector.length,
      now,
      now,
    );
  }

  async search(
    collection: string,
    query: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    assertNonEmpty('collection', collection);
    assertFiniteVector('query', query);
    if (limit <= 0) return [];

    const rows = this.db
      .prepare(`
        SELECT id, vector, metadata, dimensions
        FROM vectors
        WHERE collection = ? AND dimensions = ?
      `)
      .all(collection, query.length) as StoredVectorRow[];

    const candidates: VectorSearchResult[] = [];
    for (const row of rows) {
      let vector: number[];
      let metadata: Record<string, unknown>;
      try {
        vector = JSON.parse(row.vector) as number[];
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (!Array.isArray(vector)) continue;
      if (!matchesFilter(metadata, filter)) continue;
      const score = cosineSimilarity(query, vector);
      candidates.push({
        id: row.id,
        score,
        metadata,
      });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });
    return candidates.slice(0, limit);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    assertNonEmpty('collection', collection);
    assertNonEmpty('id', id);
    const result = this.db
      .prepare('DELETE FROM vectors WHERE collection = ? AND id = ?')
      .run(collection, id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

