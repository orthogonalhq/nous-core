import { createHash, randomUUID } from 'node:crypto';
import type {
  ExternalSourceCompactCommand,
  ExternalSourceCompactionResult,
  ExternalSourceDeleteCommand,
  ExternalSourceGetQuery,
  ExternalSourceMemoryEntry,
  ExternalSourceMutationResult,
  ExternalSourcePutCommand,
  ExternalSourceSearchQuery,
  ExternalSourceSearchResult,
  IExternalSourceMemoryService,
  IDocumentStore,
  IWitnessService,
  PublicMcpMemoryTier,
  PublicMcpNamespaceRecord,
} from '@nous/shared';
import {
  ExternalSourceCompactionResultSchema,
  ExternalSourceMemoryEntrySchema,
  ExternalSourceMutationResultSchema,
  ExternalSourceSearchResultSchema,
  NousError,
} from '@nous/shared';
import { AuditProjectionStore } from './audit-projection-store.js';
import { ExternalSourceStorageAdapter } from './external-source-storage-adapter.js';
import { NamespaceRegistryStore } from './namespace-registry-store.js';
import type { QuotaLimitSnapshot } from './quota-usage-store.js';
import { QuotaUsageStore } from './quota-usage-store.js';
import { RateLimitBucketStore } from './rate-limit-bucket-store.js';

interface StoredOperationAuditRecord {
  id: string;
  requestId: string;
  operation: 'put' | 'delete' | 'compact';
  namespace: string;
  tier?: PublicMcpMemoryTier;
  idempotencyKey?: string;
  entryId?: string;
  result: unknown;
  createdAt: string;
}

interface SourcePurgeResult {
  purgedCollections: string[];
  retainedAuditRows: number;
}

export interface ExternalSourceMemoryServiceOptions {
  documentStore: IDocumentStore;
  namespaceStore: NamespaceRegistryStore;
  auditStore?: AuditProjectionStore;
  storageAdapter: ExternalSourceStorageAdapter;
  quotaStore: QuotaUsageStore;
  rateLimitStore: RateLimitBucketStore;
  witnessService?: IWitnessService;
  quotaLimits?: QuotaLimitSnapshot;
  quotaWindowSeconds?: number;
  rateLimitWindowSeconds?: number;
  rateLimitMaxRequests?: number;
  now?: () => string;
  idFactory?: () => string;
}

const DEFAULT_QUOTA_LIMITS: QuotaLimitSnapshot = {
  maxReadUnits: 120,
  maxWriteUnits: 60,
  maxBytesReserved: 262144,
};

const DEFAULT_QUOTA_WINDOW_SECONDS = 3600;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;

export class ExternalSourceMemoryService implements IExternalSourceMemoryService {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: ExternalSourceMemoryServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async put(request: ExternalSourcePutCommand): Promise<ExternalSourceMutationResult> {
    this.assertNamespaceAuthorized(request.arguments.namespace, request.subject.namespace);
    const record = await this.ensureNamespaceRecord(request.subject);
    this.assertLifecycleWritable(record, 'ortho.memory.v1.put');

    const idempotencyKey = request.arguments.idempotencyKey;
    const replay = await this.findIdempotentResult(
      record,
      'put',
      idempotencyKey,
      (value) => ExternalSourceMutationResultSchema.parse(value),
    );
    if (replay) {
      return replay;
    }

    await this.consumeEnforcement(record, request.subject.tokenFingerprint, 'ortho.memory.v1.put', {
      writeUnitsDelta: 1,
      bytesReservedDelta: Buffer.byteLength(request.arguments.content, 'utf8'),
      requestedAt: request.requestedAt,
    });

    await this.assertLifecycleStillWritable(record.namespace, 'ortho.memory.v1.put');

    const now = this.now();
    const entryId = request.arguments.entryId ?? this.idFactory();
    const nextEntry = ExternalSourceMemoryEntrySchema.parse({
      id: entryId,
      namespace: record.namespace,
      tier: request.arguments.tier,
      content: request.arguments.content,
      tags: request.arguments.tags,
      metadata: request.arguments.metadata,
      createdAt: now,
      updatedAt: now,
      sourceOperation:
        request.arguments.mode === 'supersede' ? 'put' : 'put',
      idempotencyKey,
    });

    if (request.arguments.mode === 'supersede') {
      if (!request.arguments.supersedesEntryId) {
        throw new NousError(
          'supersede mode requires supersedesEntryId',
          'VALIDATION_ERROR',
        );
      }

      const prior = await this.options.storageAdapter.getEntry(
        record,
        request.arguments.tier,
        request.arguments.supersedesEntryId,
      );
      if (!prior) {
        throw new NousError(
          'superseded entry does not exist in this source namespace',
          'VALIDATION_ERROR',
        );
      }

      const updatedPrior = ExternalSourceMemoryEntrySchema.parse({
        ...prior,
        lifecycleStatus: 'superseded',
        supersededBy: nextEntry.id,
        updatedAt: now,
      });
      await this.options.storageAdapter.putEntry(record, updatedPrior);
    }

    await this.options.storageAdapter.putEntry(record, nextEntry);
    await this.options.namespaceStore.markMutation(record.namespace, now);

    const result = ExternalSourceMutationResultSchema.parse({
      entry: nextEntry,
      entryId: nextEntry.id,
      alreadyApplied: false,
    });
    await this.writeOperationAudit(record, {
      id: request.requestId,
      requestId: request.requestId,
      operation: 'put',
      namespace: record.namespace,
      tier: nextEntry.tier,
      idempotencyKey,
      entryId: nextEntry.id,
      result,
      createdAt: now,
    });

    return result;
  }

  async get(request: ExternalSourceGetQuery): Promise<ExternalSourceMemoryEntry | null> {
    this.assertNamespaceAuthorized(request.arguments.namespace, request.subject.namespace);
    const record = await this.ensureNamespaceRecord(request.subject);
    const entry = await this.options.storageAdapter.getEntry(
      record,
      request.arguments.tier,
      request.arguments.entryId,
    );

    if (!entry) {
      return null;
    }
    if (entry.lifecycleStatus === 'superseded') {
      return null;
    }
    if (entry.lifecycleStatus === 'soft-deleted' && !request.arguments.includeDeleted) {
      return null;
    }
    return ExternalSourceMemoryEntrySchema.parse(entry);
  }

  async search(request: ExternalSourceSearchQuery): Promise<ExternalSourceSearchResult> {
    this.assertNamespaceAuthorized(request.arguments.namespace, request.subject.namespace);
    const record = await this.ensureNamespaceRecord(request.subject);

    await this.consumeEnforcement(record, request.subject.tokenFingerprint, 'ortho.memory.v1.search', {
      readUnitsDelta: 1,
      requestedAt: request.requestedAt,
    });

    return ExternalSourceSearchResultSchema.parse(
      await this.options.storageAdapter.searchEntries(record, request.arguments),
    );
  }

  async delete(
    request: ExternalSourceDeleteCommand,
  ): Promise<ExternalSourceMutationResult> {
    this.assertNamespaceAuthorized(request.arguments.namespace, request.subject.namespace);
    const record = await this.ensureNamespaceRecord(request.subject);
    this.assertLifecycleWritable(record, 'ortho.memory.v1.delete');

    const replay = request.arguments.idempotencyKey
      ? await this.findIdempotentResult(
          record,
          'delete',
          request.arguments.idempotencyKey,
          (value) => ExternalSourceMutationResultSchema.parse(value),
        )
      : null;
    if (replay) {
      return replay;
    }

    await this.consumeEnforcement(record, request.subject.tokenFingerprint, 'ortho.memory.v1.delete', {
      writeUnitsDelta: 1,
      requestedAt: request.requestedAt,
    });

    await this.assertLifecycleStillWritable(record.namespace, 'ortho.memory.v1.delete');

    const existing = await this.options.storageAdapter.getEntry(
      record,
      request.arguments.tier,
      request.arguments.entryId,
    );
    if (!existing || existing.lifecycleStatus === 'soft-deleted') {
      return ExternalSourceMutationResultSchema.parse({
        entryId: request.arguments.entryId,
        alreadyApplied: true,
      });
    }

    const now = this.now();
    const deletedEntry = ExternalSourceMemoryEntrySchema.parse({
      ...existing,
      lifecycleStatus: 'soft-deleted',
      deletedAt: now,
      updatedAt: now,
      idempotencyKey: request.arguments.idempotencyKey ?? existing.idempotencyKey,
    });

    await this.options.storageAdapter.putEntry(record, deletedEntry);
    await this.options.storageAdapter.deleteVector(record, deletedEntry.id);
    await this.writeTombstone(record, {
      id: `tombstone:${deletedEntry.id}:${request.requestId}`,
      entryId: deletedEntry.id,
      requestId: request.requestId,
      deletedAt: now,
      reason: request.arguments.reason ?? 'public soft delete',
    });
    await this.options.namespaceStore.markMutation(record.namespace, now);

    const result = ExternalSourceMutationResultSchema.parse({
      entry: deletedEntry,
      entryId: deletedEntry.id,
      alreadyApplied: false,
    });
    await this.writeOperationAudit(record, {
      id: request.requestId,
      requestId: request.requestId,
      operation: 'delete',
      namespace: record.namespace,
      tier: deletedEntry.tier,
      idempotencyKey: request.arguments.idempotencyKey,
      entryId: deletedEntry.id,
      result,
      createdAt: now,
    });

    return result;
  }

  async compact(
    request: ExternalSourceCompactCommand,
  ): Promise<ExternalSourceCompactionResult> {
    this.assertNamespaceAuthorized(request.arguments.namespace, request.subject.namespace);
    const record = await this.ensureNamespaceRecord(request.subject);
    this.assertLifecycleWritable(record, 'ortho.memory.v1.compact');

    const replay = request.arguments.idempotencyKey
      ? await this.findIdempotentResult(
          record,
          'compact',
          request.arguments.idempotencyKey,
          (value) => ExternalSourceCompactionResultSchema.parse(value),
        )
      : null;
    if (replay) {
      return replay;
    }

    await this.consumeEnforcement(record, request.subject.tokenFingerprint, 'ortho.memory.v1.compact', {
      writeUnitsDelta: 1,
      requestedAt: request.requestedAt,
    });

    await this.assertLifecycleStillWritable(record.namespace, 'ortho.memory.v1.compact');

    const now = this.now();
    const sourceEntries = (await this.options.storageAdapter.queryEntries(record, 'stm'))
      .filter((entry) => entry.lifecycleStatus === 'active')
      .sort(sortEntriesByRecency)
      .slice(0, request.arguments.maxEntries);

    const derivedEntries =
      request.arguments.strategy === 'summarize'
        ? [this.buildSummaryEntry(record.namespace, sourceEntries, now, request.arguments.idempotencyKey)]
        : this.buildFactEntries(record.namespace, sourceEntries, now, request.arguments.idempotencyKey);

    for (const entry of derivedEntries) {
      await this.options.storageAdapter.putEntry(record, entry);
    }
    await this.options.namespaceStore.markCompaction(record.namespace, now);

    const result = ExternalSourceCompactionResultSchema.parse({
      strategy: request.arguments.strategy,
      sourceTier: 'stm',
      sourceEntryCount: sourceEntries.length,
      derivedEntryIds: derivedEntries.map((entry) => entry.id),
    });
    await this.writeOperationAudit(record, {
      id: request.requestId,
      requestId: request.requestId,
      operation: 'compact',
      namespace: record.namespace,
      tier: request.arguments.strategy === 'summarize' ? 'stm' : 'ltm',
      idempotencyKey: request.arguments.idempotencyKey,
      entryId: derivedEntries[0]?.id,
      result,
      createdAt: now,
    });

    return result;
  }

  async quarantineSource(namespace: string, reason: string): Promise<PublicMcpNamespaceRecord> {
    const timestamp = this.now();
    const record = await this.options.namespaceStore.quarantine(namespace, reason, timestamp);
    const witness = await this.appendLifecycleWitness(
      `public-mcp:quarantine:${namespace}`,
      {
        namespace,
        lifecycleState: record.lifecycleState,
        reason,
      },
    );

    if (this.options.auditStore) {
      await this.options.auditStore.save({
        requestId: randomUUID(),
        timestamp,
        oauthClientId: record.clientId,
        namespace,
        lifecycleAction: 'quarantine',
        outcome: 'completed',
        lifecycleState: record.lifecycleState,
        latencyMs: 0,
        authorizationEventId: witness.authorizationEventId as any,
        completionEventId: witness.completionEventId as any,
        createdAt: timestamp,
      });
    }

    return record;
  }

  async purgeSource(namespace: string): Promise<SourcePurgeResult> {
    const record = await this.options.namespaceStore.get(namespace);
    if (!record) {
      throw new NousError(`Unknown namespace ${namespace}`, 'NAMESPACE_UNAUTHORIZED');
    }

    const timestamp = this.now();
    await this.options.namespaceStore.markPurging(namespace, timestamp);
    const retainedAuditRows = this.options.auditStore
      ? await this.options.auditStore.countByNamespace(namespace)
      : 0;
    const purge = await this.options.storageAdapter.purge(record);
    await this.options.quotaStore.clearNamespace(namespace);
    await this.options.rateLimitStore.clearNamespace(namespace);
    const updated = await this.options.namespaceStore.markPurged(namespace, this.now());
    const witness = await this.appendLifecycleWitness(
      `public-mcp:purge:${namespace}`,
      {
        namespace,
        purgedCollections: purge.purgedCollections,
        retainedAuditRows,
        lifecycleState: updated.lifecycleState,
      },
    );

    if (this.options.auditStore) {
      await this.options.auditStore.save({
        requestId: randomUUID(),
        timestamp: this.now(),
        oauthClientId: updated.clientId,
        namespace,
        lifecycleAction: 'purge',
        outcome: 'completed',
        lifecycleState: updated.lifecycleState,
        latencyMs: 0,
        authorizationEventId: witness.authorizationEventId as any,
        completionEventId: witness.completionEventId as any,
        createdAt: this.now(),
      });
    }

    return {
      purgedCollections: purge.purgedCollections,
      retainedAuditRows,
    };
  }

  private async ensureNamespaceRecord(subject: {
    namespace: string;
    clientId: string;
    clientIdHash: string;
  }): Promise<PublicMcpNamespaceRecord> {
    return this.options.namespaceStore.ensureNamespace({
      namespace: subject.namespace,
      clientId: subject.clientId,
      clientIdHash: subject.clientIdHash,
      subspace: parseNamespaceSubspace(subject.namespace),
    });
  }

  private assertNamespaceAuthorized(requestNamespace: string, subjectNamespace: string): void {
    if (requestNamespace !== subjectNamespace) {
      throw new NousError(
        'Requested namespace does not match the authorized external source namespace',
        'NAMESPACE_UNAUTHORIZED',
        {
          requestNamespace,
          subjectNamespace,
        },
      );
    }
  }

  private assertLifecycleWritable(
    record: Pick<PublicMcpNamespaceRecord, 'lifecycleState' | 'namespace'>,
    toolName: string,
  ): void {
    if (record.lifecycleState === 'active') {
      return;
    }

    throw new NousError(
      `Source namespace ${record.namespace} is ${record.lifecycleState} and blocks durable mutation`,
      'SOURCE_QUARANTINED',
      {
        namespace: record.namespace,
        toolName,
        lifecycleState: record.lifecycleState,
      },
    );
  }

  private async assertLifecycleStillWritable(namespace: string, toolName: string): Promise<void> {
    const current = await this.options.namespaceStore.get(namespace);
    if (!current) {
      throw new NousError(`Unknown namespace ${namespace}`, 'NAMESPACE_UNAUTHORIZED');
    }
    this.assertLifecycleWritable(current, toolName);
  }

  private async consumeEnforcement(
    record: PublicMcpNamespaceRecord,
    tokenFingerprint: string | undefined,
    toolName: string,
    input: {
      readUnitsDelta?: number;
      writeUnitsDelta?: number;
      bytesReservedDelta?: number;
      requestedAt: string;
    },
  ): Promise<void> {
    const fingerprint = tokenFingerprint ?? this.deriveFallbackFingerprint(record);
    const quotaWindow = getWindowBounds(
      this.options.quotaWindowSeconds ?? DEFAULT_QUOTA_WINDOW_SECONDS,
      input.requestedAt,
    );
    const quota = await this.options.quotaStore.consume({
      namespace: record.namespace,
      tokenFingerprint: fingerprint,
      windowStartedAt: quotaWindow.windowStartedAt,
      windowEndsAt: quotaWindow.windowEndsAt,
      readUnitsDelta: input.readUnitsDelta,
      writeUnitsDelta: input.writeUnitsDelta,
      bytesReservedDelta: input.bytesReservedDelta,
      limitSnapshot: this.options.quotaLimits ?? DEFAULT_QUOTA_LIMITS,
    });
    if (!quota.allowed) {
      throw new NousError(
        'Quota exhausted for this source namespace',
        'QUOTA_EXCEEDED',
        {
          namespace: record.namespace,
          toolName,
          tokenFingerprint: fingerprint,
          quotaDecision: 'reject',
          usage: {
            readUnitsUsed: quota.record.readUnitsUsed,
            writeUnitsUsed: quota.record.writeUnitsUsed,
            bytesReserved: quota.record.bytesReserved,
          },
          limit: quota.record.limitSnapshot,
        },
      );
    }

    const rateLimitWindowSeconds =
      this.options.rateLimitWindowSeconds ?? DEFAULT_RATE_LIMIT_WINDOW_SECONDS;
    const rateWindow = getWindowBounds(rateLimitWindowSeconds, input.requestedAt);
    const rateLimit = await this.options.rateLimitStore.consume({
      namespace: record.namespace,
      tokenFingerprint: fingerprint,
      toolName,
      windowStartedAt: rateWindow.windowStartedAt,
      windowSeconds: rateLimitWindowSeconds,
      maxRequests: this.options.rateLimitMaxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    });
    if (!rateLimit.allowed) {
      throw new NousError(
        'Rate limit exceeded for this source namespace',
        'RATE_LIMITED',
        {
          namespace: record.namespace,
          toolName,
          tokenFingerprint: fingerprint,
          rateLimitDecision: 'reject',
          windowSeconds: rateLimit.record.windowSeconds,
          requestCount: rateLimit.record.requestCount,
          blockedUntil: rateLimit.record.blockedUntil,
        },
      );
    }
  }

  private async findIdempotentResult<T>(
    record: PublicMcpNamespaceRecord,
    operation: StoredOperationAuditRecord['operation'],
    idempotencyKey: string | undefined,
    parse: (value: unknown) => T,
  ): Promise<T | null> {
    if (!idempotencyKey) {
      return null;
    }

    const rows = await this.options.documentStore.query<StoredOperationAuditRecord>(
      record.mutationAuditCollection,
      {
        where: {
          operation,
          idempotencyKey,
        },
      },
    );
    const found = rows[0];
    return found ? parse(found.result) : null;
  }

  private async writeOperationAudit(
    record: PublicMcpNamespaceRecord,
    row: StoredOperationAuditRecord,
  ): Promise<void> {
    await this.options.documentStore.put(
      record.mutationAuditCollection,
      row.id,
      row,
    );
  }

  private async writeTombstone(
    record: PublicMcpNamespaceRecord,
    tombstone: Record<string, unknown>,
  ): Promise<void> {
    await this.options.documentStore.put(
      record.tombstoneCollection,
      String(tombstone.id),
      tombstone,
    );
  }

  private buildSummaryEntry(
    namespace: string,
    sourceEntries: ExternalSourceMemoryEntry[],
    timestamp: string,
    idempotencyKey?: string,
  ): ExternalSourceMemoryEntry {
    const content =
      sourceEntries.length === 0
        ? 'No source entries available for summarization.'
        : sourceEntries.map((entry) => entry.content).join('\n');
    return ExternalSourceMemoryEntrySchema.parse({
      id: this.idFactory(),
      namespace,
      tier: 'stm',
      content,
      tags: ['summary'],
      metadata: {
        derivedFromCount: String(sourceEntries.length),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceOperation: 'compact_summary',
      idempotencyKey,
    });
  }

  private buildFactEntries(
    namespace: string,
    sourceEntries: ExternalSourceMemoryEntry[],
    timestamp: string,
    idempotencyKey?: string,
  ): ExternalSourceMemoryEntry[] {
    const facts = Array.from(
      new Set(
        sourceEntries
          .flatMap((entry) => entry.content.split(/[\n.!?]+/))
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ).slice(0, Math.max(1, Math.min(sourceEntries.length, 5)));

    if (facts.length === 0) {
      return [];
    }

    return facts.map((fact) =>
      ExternalSourceMemoryEntrySchema.parse({
        id: this.idFactory(),
        namespace,
        tier: 'ltm',
        content: fact,
        tags: ['fact'],
        metadata: {},
        createdAt: timestamp,
        updatedAt: timestamp,
        sourceOperation: 'compact_extract_facts',
        idempotencyKey,
      }),
    );
  }

  private deriveFallbackFingerprint(record: PublicMcpNamespaceRecord): string {
    return createHash('sha256')
      .update(`${record.clientId}:${record.clientIdHash}:${record.namespace}`)
      .digest('hex');
  }

  private async appendLifecycleWitness(
    actionRef: string,
    detail: Record<string, unknown>,
  ): Promise<{
    authorizationEventId?: string;
    completionEventId?: string;
  }> {
    const witnessService = this.options.witnessService;
    if (!witnessService) {
      return {};
    }

    const authorization = await witnessService.appendAuthorization({
      actionCategory: 'tool-execute',
      actionRef,
      actor: 'subcortex',
      status: 'approved',
      detail,
    });
    const completion = await witnessService.appendCompletion({
      actionCategory: 'tool-execute',
      actionRef,
      authorizationRef: authorization.id,
      actor: 'subcortex',
      status: 'succeeded',
      detail,
    });

    return {
      authorizationEventId: authorization.id,
      completionEventId: completion.id,
    };
  }
}

function parseNamespaceSubspace(namespace: string): string | undefined {
  const parts = namespace.split(':');
  return parts.length >= 3 ? parts.slice(2).join(':') : undefined;
}

function getWindowBounds(windowSeconds: number, timestamp: string) {
  const millis = Date.parse(timestamp);
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(millis / windowMs) * windowMs;
  return {
    windowStartedAt: new Date(windowStartMs).toISOString(),
    windowEndsAt: new Date(windowStartMs + windowMs).toISOString(),
  };
}

function sortEntriesByRecency(
  left: ExternalSourceMemoryEntry,
  right: ExternalSourceMemoryEntry,
): number {
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.id.localeCompare(right.id);
}
