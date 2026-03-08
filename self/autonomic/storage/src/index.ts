/**
 * @nous/autonomic-storage — Persistence backends for Nous-OSS.
 *
 * Provides real SQLite-backed document/vector stores and stubs
 * for deferred graph storage and optional fallback vector wiring.
 */
export { SqliteDocumentStore } from './sqlite-document-store.js';
export { SqliteVectorStore } from './sqlite-vector-store.js';
export { StubVectorStore, StubGraphStore } from './stubs.js';
export { InMemoryVectorStore } from './in-memory-vector-store.js';
