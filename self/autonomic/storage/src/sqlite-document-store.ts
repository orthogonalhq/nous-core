/**
 * SqliteDocumentStore — IDocumentStore implementation backed by better-sqlite3.
 *
 * Stores documents as JSON text in a single table with (collection, id) composite key.
 * Collections are logical namespaces for project-scoped isolation.
 *
 * Query support: top-level field equality via json_extract(). Nested paths,
 * range operators, and array containment are deferred to future phases.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IDocumentStore, DocumentFilter } from '@nous/shared';
import { ValidationError } from '@nous/shared';

const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

function validateFieldName(name: string): void {
  if (!FIELD_NAME_PATTERN.test(name)) {
    throw new ValidationError(`Invalid field name in query: "${name}"`, [
      {
        path: name,
        message: `Field name must match ${FIELD_NAME_PATTERN}. Got: "${name}"`,
      },
    ]);
  }
}

export class SqliteDocumentStore implements IDocumentStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_collection
        ON documents (collection);
    `);

    console.log(`[nous:storage] Database initialized at ${dbPath}`);
  }

  async put<T>(collection: string, id: string, document: T): Promise<void> {
    const now = new Date().toISOString();
    const data = JSON.stringify(document);

    const stmt = this.db.prepare(`
      INSERT INTO documents (collection, id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `);

    stmt.run(collection, id, data, now, now);
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const stmt = this.db.prepare(
      'SELECT data FROM documents WHERE collection = ? AND id = ?',
    );
    const row = stmt.get(collection, id) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.data) as T;
  }

  async query<T>(collection: string, filter: DocumentFilter): Promise<T[]> {
    const conditions: string[] = ['collection = ?'];
    const params: unknown[] = [collection];

    if (filter.where) {
      for (const [key, value] of Object.entries(filter.where)) {
        validateFieldName(key);
        conditions.push(`json_extract(data, '$.${key}') = ?`);
        params.push(value);
      }
    }

    let sql = `SELECT data FROM documents WHERE ${conditions.join(' AND ')}`;

    if (filter.orderBy) {
      validateFieldName(filter.orderBy);
      const direction = filter.orderDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY json_extract(data, '$.${filter.orderBy}') ${direction}`;
    }

    if (filter.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset !== undefined) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<{ data: string }>;

    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const stmt = this.db.prepare(
      'DELETE FROM documents WHERE collection = ? AND id = ?',
    );
    const result = stmt.run(collection, id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
