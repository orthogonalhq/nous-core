/**
 * Autonomic layer interface contracts.
 *
 * IDocumentStore, IVectorStore, IGraphStore, IEmbedder,
 * IRuntime, IConfig, IHealthMonitor.
 */
import type {
  DocumentFilter,
  VectorFilter,
  VectorSearchResult,
  GraphNode,
  PlatformInfo,
  HealthReport,
  SystemMetrics,
} from '../types/index.js';

// SystemConfig is defined in @nous/autonomic-config, but the interface
// references it. We define a minimal type here to avoid circular deps.
// The actual schema lives in self/autonomic/config.
export interface SystemConfig {
  [key: string]: unknown;
}

export interface IDocumentStore {
  /** Put a document */
  put<T>(collection: string, id: string, document: T): Promise<void>;

  /** Get a document by ID */
  get<T>(collection: string, id: string): Promise<T | null>;

  /** Query documents */
  query<T>(collection: string, filter: DocumentFilter): Promise<T[]>;

  /** Delete a document */
  delete(collection: string, id: string): Promise<boolean>;
}

export interface IVectorStore {
  /** Upsert a vector with metadata */
  upsert(
    collection: string,
    id: string,
    vector: number[],
    metadata: Record<string, unknown>,
  ): Promise<void>;

  /** Search for similar vectors */
  search(
    collection: string,
    query: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]>;

  /** Delete a vector */
  delete(collection: string, id: string): Promise<boolean>;
}

export interface IGraphStore {
  /** Add a node to the graph */
  addNode(
    id: string,
    labels: string[],
    properties: Record<string, unknown>,
  ): Promise<void>;

  /** Add an edge between two nodes */
  addEdge(
    fromId: string,
    toId: string,
    type: string,
    properties?: Record<string, unknown>,
  ): Promise<void>;

  /** Query neighbors of a node */
  getNeighbors(
    id: string,
    edgeType?: string,
    direction?: 'in' | 'out' | 'both',
  ): Promise<GraphNode[]>;

  /** Delete a node and its edges */
  deleteNode(id: string): Promise<boolean>;
}

export interface IEmbedder {
  /** Generate an embedding vector for text */
  embed(text: string): Promise<number[]>;

  /** Generate embedding vectors for a batch of texts */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Get the dimensionality of the embedding model */
  getDimensions(): number;
}

export interface IRuntime {
  /** Get a platform-safe path */
  resolvePath(...segments: string[]): string;

  /** Get the data directory for Nous */
  getDataDir(): string;

  /** Check if a path exists */
  exists(path: string): Promise<boolean>;

  /** Get platform information */
  getPlatform(): PlatformInfo;
}

export interface IConfig {
  /** Get the full validated system configuration */
  get(): SystemConfig;

  /** Get a specific section of the configuration */
  getSection<K extends keyof SystemConfig>(section: K): SystemConfig[K];

  /** Update a configuration value */
  update<K extends keyof SystemConfig>(
    section: K,
    value: Partial<SystemConfig[K]>,
  ): Promise<void>;

  /** Reload configuration from disk */
  reload(): Promise<void>;
}

export interface IHealthMonitor {
  /** Run a health check */
  check(): Promise<HealthReport>;

  /** Get system metrics */
  getMetrics(): Promise<SystemMetrics>;
}
