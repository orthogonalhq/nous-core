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
  CredentialInjectRequest,
  CredentialInjectedResponse,
  CredentialMetadata,
  CredentialBackupResult,
  CredentialDiscardBackupResult,
  CredentialNamespacePurgeResult,
  CredentialRevokeRequest,
  CredentialRevokeResult,
  CredentialRestoreResult,
  CredentialStoreRequest,
  CredentialStoreResult,
  GatewayBootProjection,
  GatewayHealthProjection,
  SystemContextProjection,
  ModelProviderConfig,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
  SystemStatusSnapshot,
} from '../types/index.js';

import type { PersonalityConfig as SharedPersonalityConfig } from './agent-gateway.js';

// SystemConfig is defined in @nous/autonomic-config, but the interface
// references it. We define a minimal type here to avoid circular deps.
// The actual schema lives in self/autonomic/config.
export interface SystemConfig {
  [key: string]: unknown;
}

/**
 * SP 1.3 — Decision 7 identity-persistence-schema-v1.
 *
 * Structural mirror of `UserProfile` declared canonically in
 * `@nous/autonomic-config` (`self/autonomic/config/src/schema.ts`). The mirror
 * lives here adjacent to `IConfig` so the boundary type for `IConfig`'s
 * profile reader/writer does not require an `@nous/shared → @nous/autonomic-config`
 * import (which would violate ADR 018's layering invariant — see SDS § 1.3 / I2).
 *
 * Every field is optional; absent fields produce a `{}` shape from
 * `IConfig.getUserProfile()`. Adding a field is an additive Zod schema change
 * in the canonical schema. Renaming or removing requires explicit migration
 * (Decision 7 § Profile Schema Constraints).
 *
 * Drift from the canonical Zod-derived `UserProfile` is detected by
 * `self/autonomic/config/src/__tests__/iconfig-profile-compat.test.ts`.
 */
export interface AgentUserProfile {
  readonly displayName?: string;
  readonly role?: string;
  readonly primaryUseCase?: string;
  readonly expertise?: 'beginner' | 'intermediate' | 'advanced';
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

  /** Create a directory tree if it does not already exist */
  ensureDir(path: string): Promise<void>;

  /** Write a text or binary file */
  writeFile(path: string, content: string | Uint8Array): Promise<void>;

  /** Copy one directory tree recursively */
  copyDirectory(from: string, to: string): Promise<void>;

  /** Remove a file or directory tree if it exists */
  removePath(path: string): Promise<void>;

  /** List the direct entries within a directory */
  listDirectory(path: string): Promise<string[]>;

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

  // SP 1.3 — agent block readers (Decision 7 identity-persistence-schema-v1).
  // Each reader synthesizes its typed default at read time when the `agent`
  // block is absent on disk; defaults are NEVER written to disk by readers
  // (see `ConfigManager.getAgent*`).
  /** Get the agent's display name. Default: `"Nous"`. */
  getAgentName(): string;
  /** Get the agent's personality config. Default: `{ preset: 'balanced' }`. */
  getPersonalityConfig(): SharedPersonalityConfig;
  /** Get the user profile. Default: `{}`. */
  getUserProfile(): AgentUserProfile;
  /** Get the welcome-message-sent flag. Default: `false`. */
  getWelcomeMessageSent(): boolean;

  // SP 1.3 — agent block writers (Decision 7).
  // Writers create the `agent` block on first write and preserve sibling
  // fields on subsequent writes. Each writer validates the candidate config
  // through Zod before persisting; invalid input throws ConfigError and
  // leaves disk unchanged.
  /** Persist the agent's display name. */
  setAgentName(name: string): Promise<void>;
  /** Persist the agent's personality config. */
  setPersonalityConfig(config: SharedPersonalityConfig): Promise<void>;
  /** Persist the user profile. */
  setUserProfile(profile: AgentUserProfile): Promise<void>;
  /** Persist the welcome-message-sent flag. */
  setWelcomeMessageSent(value: boolean): Promise<void>;
  /**
   * Remove the entire `agent` block from disk. No-op when block already
   * absent. Other top-level keys (`providers`, `modelRoleAssignments`, etc.)
   * are preserved bit-for-bit.
   */
  clearAgentBlock(): Promise<void>;
}

export interface IHealthMonitor {
  /** Run a health check */
  check(): Promise<HealthReport>;

  /** Get system metrics */
  getMetrics(): Promise<SystemMetrics>;
}

/**
 * Adapter interface for gateway runtime health data.
 *
 * Abstracts the read-only health query methods of CortexRuntime
 * (defined in @nous/cortex-core) so that autonomic-layer consumers can depend on
 * @nous/shared only, respecting the dependency rule:
 *   autonomic/ -> depends on interfaces in shared/
 *   autonomic/ -> never touches cortex/
 *
 * Implemented by CortexRuntime at the DI composition root (sub-phase 1.2).
 */
export interface IGatewayHealthSource {
  /** Get the current boot status snapshot. */
  getBootSnapshot(): GatewayBootProjection;

  /** Get the health snapshot for a specific agent gateway. */
  getGatewayHealth(agentClass: string): GatewayHealthProjection;

  /** Get the system context replica with operational state. */
  getSystemContextReplica(): SystemContextProjection;
}

/**
 * Adapter interface for provider enumeration.
 *
 * Abstracts ProviderRegistry.listProviders() so that autonomic-layer consumers
 * can depend on @nous/shared only.
 *
 * ProviderRegistry in @nous/subcortex-providers is structurally compatible
 * with this interface (listProviders() returns ModelProviderConfig[]).
 */
export interface IProviderHealthSource {
  /** Enumerate all configured model providers. */
  listProviders(): ModelProviderConfig[];
}

/**
 * Supplementary interface for granular health data queries.
 *
 * Provides domain-specific snapshot accessors that IHealthMonitor's coarse
 * two-method contract (check/getMetrics) does not expose. Methods are
 * synchronous because all data is cached in memory.
 */
export interface IHealthAggregator {
  /** Get health snapshot for all configured model providers. */
  getProviderHealth(): ProviderHealthSnapshot;

  /** Get status snapshot for agent gateways and app sessions. */
  getAgentStatus(): AgentStatusSnapshot;

  /** Get system-wide status including boot state and backlog analytics. */
  getSystemStatus(): SystemStatusSnapshot;

  /** Release EventBus subscriptions and internal resources. */
  dispose(): void;
}

export interface ICredentialVaultService {
  /** Store or replace one app-scoped credential. */
  store(appId: string, request: CredentialStoreRequest): Promise<CredentialStoreResult>;

  /** Retrieve safe metadata for one app-scoped credential. */
  getMetadata(appId: string, key: string): Promise<CredentialMetadata | null>;

  /** Revoke one app-scoped credential. */
  revoke(appId: string, request: CredentialRevokeRequest): Promise<CredentialRevokeResult>;

  /** Create an opaque backup handle for one app-scoped credential. */
  backup(appId: string, key: string): Promise<CredentialBackupResult>;

  /** Restore a previously created opaque backup handle. */
  restore(appId: string, backupRef: string): Promise<CredentialRestoreResult>;

  /** Discard an unused opaque backup handle. */
  discardBackup(
    appId: string,
    backupRef: string,
  ): Promise<CredentialDiscardBackupResult>;

  /** Purge every credential in one app namespace. */
  purgeNamespace(appId: string): Promise<CredentialNamespacePurgeResult>;

  /** Resolve one credential for the injector path only. */
  resolveForInjection(appId: string, key: string): Promise<{
    metadata: CredentialMetadata;
    secretValue: string;
  } | null>;
}

export interface ICredentialInjector {
  /** Execute one outbound request with a credential injected by infrastructure. */
  executeInjectedRequest(input: {
    appId: string;
    request: CredentialInjectRequest;
    manifestNetworkPermissions: readonly string[];
  }): Promise<CredentialInjectedResponse>;
}
