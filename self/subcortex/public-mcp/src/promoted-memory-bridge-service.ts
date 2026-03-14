import { randomUUID } from 'node:crypto';
import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  ExternalSourceMemoryEntry,
  IDocumentStore,
  IEmbedder,
  IPfcEngine,
  IPromotedMemoryBridgeService,
  IVectorStore,
  IWitnessService,
  PromoteExternalRecordCommand,
  PromotedMemoryAuditRecord,
  PromotedMemoryGetQuery,
  PromotedMemoryRecord,
  PromotedMemorySearchQuery,
  PromotedMemorySearchResult,
  PromotedMemorySearchResultItem,
  PublicMcpMemoryTier,
  PublicMcpNamespaceRecord,
  TraceEvidenceReference,
  DemotePromotedRecordCommand,
} from '@nous/shared';
import {
  ConfidenceGovernanceEvaluationResultSchema,
  NousError,
  PromotedMemoryAuditRecordSchema,
  PromotedMemoryGetQuerySchema,
  PromotedMemoryRecordSchema,
  PromotedMemorySearchResultSchema,
  PromotedMemorySearchResultItemSchema,
  type PromotedSourceProvenance,
  PromotedMemoryTombstoneSchema,
} from '@nous/shared';
import { ExternalSourceStorageAdapter } from './external-source-storage-adapter.js';
import { NamespaceRegistryStore } from './namespace-registry-store.js';

export const PROMOTED_MEMORY_COLLECTION = 'promoted:ltm';
export const PROMOTED_MEMORY_VECTOR_COLLECTION = 'promoted:vectors';
export const PROMOTED_MEMORY_AUDIT_COLLECTION = 'promoted:audit';
export const PROMOTED_MEMORY_TOMBSTONE_COLLECTION = 'promoted:tombstones';

export interface PromotedMemoryBridgeServiceOptions {
  documentStore: IDocumentStore;
  namespaceStore: NamespaceRegistryStore;
  storageAdapter: ExternalSourceStorageAdapter;
  pfc?: IPfcEngine;
  witnessService?: IWitnessService;
  vectorStore?: IVectorStore;
  embedder?: IEmbedder;
  now?: () => string;
  idFactory?: () => string;
}

export class PromotedMemoryBridgeService implements IPromotedMemoryBridgeService {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: PromotedMemoryBridgeServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async promote(command: PromoteExternalRecordCommand): Promise<PromotedMemoryRecord> {
    const requestId = command.requestId ?? this.idFactory();
    const timestamp = command.requestedAt ?? this.now();
    let namespaceRecord: PublicMcpNamespaceRecord;
    let sourceContext: {
      entry: ExternalSourceMemoryEntry;
      sourceRecordKey: string;
      sourceCollection: string;
      sourceSupersedesRecordId?: string;
    };
    try {
      namespaceRecord = await this.requireActiveNamespace(command.sourceNamespace);
      sourceContext = await this.requireSourceContext(
        namespaceRecord,
        command.sourceRecordId,
        command.expectedTier,
      );
    } catch (error) {
      return this.rejectPromotion(
        requestId,
        timestamp,
        command,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (sourceContext.entry.lifecycleStatus === 'soft-deleted') {
      return this.rejectPromotion(
        requestId,
        timestamp,
        command,
        'Source record is soft-deleted and unavailable for promotion',
      );
    }

    const existing = await this.findActiveBySourceKey(sourceContext.sourceRecordKey);
    if (existing) {
      return existing;
    }

    const promotedId = this.idFactory();
    const authorization = await this.appendAuthorization(
      `promoted-memory:promote:${promotedId}`,
      {
        requestId,
        sourceNamespace: command.sourceNamespace,
        sourceRecordId: command.sourceRecordId,
        rationale: command.rationale,
      },
    );

    try {
      const confidenceGovernance = await this.evaluateConfidenceGovernance(
        promotedId,
        sourceContext.entry,
      );
      const record = PromotedMemoryRecordSchema.parse({
        id: promotedId,
        sourceRecordKey: sourceContext.sourceRecordKey,
        content: sourceContext.entry.content,
        kind: derivePromotedKind(sourceContext.entry),
        tags: sourceContext.entry.tags,
        metadata: sourceContext.entry.metadata,
        lifecycleStatus: 'active',
        provenance: buildProvenance({
          sourceContext,
          promotedAt: timestamp,
        }),
        confidenceGovernance,
        promotionRationale: command.rationale,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.options.documentStore.put(PROMOTED_MEMORY_COLLECTION, record.id, record);
      await this.upsertVector(record);
      const completion = await this.appendCompletion(
        `promoted-memory:promote:${promotedId}`,
        authorization,
        {
          requestId,
          promotedId,
          sourceNamespace: command.sourceNamespace,
          sourceRecordId: command.sourceRecordId,
        },
        'succeeded',
      );
      await this.writeAudit({
        id: `${requestId}:promote`,
        requestId,
        action: 'promote',
        outcome: 'completed',
        promotedId,
        sourceNamespace: command.sourceNamespace,
        sourceRecordId: command.sourceRecordId,
        sourceRecordKey: sourceContext.sourceRecordKey,
        rationale: command.rationale,
        authorizationEventId: authorization,
        completionEventId: completion,
        createdAt: timestamp,
      });

      return record;
    } catch (error) {
      const completion = await this.appendCompletion(
        `promoted-memory:promote:${promotedId}`,
        authorization,
        {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed',
      );
      await this.writeAudit({
        id: `${requestId}:promote:failed`,
        requestId,
        action: 'promote',
        outcome: 'failed',
        promotedId,
        sourceNamespace: command.sourceNamespace,
        sourceRecordId: command.sourceRecordId,
        sourceRecordKey: sourceContext.sourceRecordKey,
        rationale: command.rationale,
        reason: error instanceof Error ? error.message : String(error),
        authorizationEventId: authorization,
        completionEventId: completion,
        createdAt: timestamp,
      });
      throw error;
    }
  }

  async demote(command: DemotePromotedRecordCommand): Promise<PromotedMemoryRecord> {
    const requestId = command.requestId ?? this.idFactory();
    const timestamp = command.requestedAt ?? this.now();
    let existing: PromotedMemoryRecord;
    try {
      existing = await this.requirePromotedRecord(command.promotedId);
    } catch (error) {
      return this.rejectDemotion(
        requestId,
        timestamp,
        command,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (existing.lifecycleStatus === 'demoted') {
      return existing;
    }

    const authorization = await this.appendAuthorization(
      `promoted-memory:demote:${existing.id}`,
      {
        requestId,
        promotedId: existing.id,
        rationale: command.rationale,
      },
    );

    try {
      const tombstoneId = `${existing.id}:tombstone:${requestId}`;
      const updated = PromotedMemoryRecordSchema.parse({
        ...existing,
        lifecycleStatus: 'demoted',
        updatedAt: timestamp,
        deletedAt: timestamp,
        tombstoneId,
      });

      await this.options.documentStore.put(PROMOTED_MEMORY_COLLECTION, updated.id, updated);
      await this.deleteVector(updated.id);
      await this.options.documentStore.put(
        PROMOTED_MEMORY_TOMBSTONE_COLLECTION,
        tombstoneId,
        PromotedMemoryTombstoneSchema.parse({
          id: tombstoneId,
          promotedId: updated.id,
          sourceRecordKey: updated.sourceRecordKey,
          reason: command.rationale,
          createdAt: timestamp,
        }),
      );
      const completion = await this.appendCompletion(
        `promoted-memory:demote:${existing.id}`,
        authorization,
        {
          requestId,
          promotedId: existing.id,
          tombstoneId,
        },
        'succeeded',
      );
      await this.writeAudit({
        id: `${requestId}:demote`,
        requestId,
        action: 'demote',
        outcome: 'completed',
        promotedId: updated.id,
        sourceNamespace: updated.provenance.sourceNamespace,
        sourceRecordId: updated.provenance.sourceRecordId,
        sourceRecordKey: updated.sourceRecordKey,
        rationale: command.rationale,
        authorizationEventId: authorization,
        completionEventId: completion,
        tombstoneId,
        createdAt: timestamp,
      });

      return updated;
    } catch (error) {
      const completion = await this.appendCompletion(
        `promoted-memory:demote:${existing.id}`,
        authorization,
        {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        },
        'failed',
      );
      await this.writeAudit({
        id: `${requestId}:demote:failed`,
        requestId,
        action: 'demote',
        outcome: 'failed',
        promotedId: existing.id,
        sourceNamespace: existing.provenance.sourceNamespace,
        sourceRecordId: existing.provenance.sourceRecordId,
        sourceRecordKey: existing.sourceRecordKey,
        rationale: command.rationale,
        reason: error instanceof Error ? error.message : String(error),
        authorizationEventId: authorization,
        completionEventId: completion,
        createdAt: timestamp,
      });
      throw error;
    }
  }

  async get(query: PromotedMemoryGetQuery): Promise<PromotedMemoryRecord | null> {
    const parsed = PromotedMemoryGetQuerySchema.parse(query);
    const raw = await this.options.documentStore.get<unknown>(
      PROMOTED_MEMORY_COLLECTION,
      parsed.promotedId,
    );
    if (!raw) {
      return null;
    }

    const record = PromotedMemoryRecordSchema.parse(raw);
    if (record.lifecycleStatus === 'demoted' && !parsed.includeDemoted) {
      return null;
    }
    return record;
  }

  async search(query: PromotedMemorySearchQuery): Promise<PromotedMemorySearchResult> {
    const rows = await this.options.documentStore.query<unknown>(
      PROMOTED_MEMORY_COLLECTION,
      {},
    );
    const records = rows
      .map((row) => PromotedMemoryRecordSchema.parse(row))
      .filter((record) => matchesPromotedQuery(record, query));

    let items: PromotedMemorySearchResultItem[];
    if (this.options.vectorStore && this.options.embedder) {
      const queryVector = await this.options.embedder.embed(query.text);
      const where: Record<string, unknown> = {};
      if (!query.includeDemoted) {
        where.lifecycleStatus = 'active';
      }
      if (query.sourceNamespace) {
        where.sourceNamespace = query.sourceNamespace;
      }
      const vectorResults = await this.options.vectorStore.search(
        PROMOTED_MEMORY_VECTOR_COLLECTION,
        queryVector,
        query.topK,
        {
          where,
        },
      );
      const scores = new Map(vectorResults.map((row) => [row.id, row.score]));
      items = records.map((record) =>
        PromotedMemorySearchResultItemSchema.parse({
          record,
          score: scores.get(record.id) ?? lexicalScore(record.content, query.text),
        }),
      );
    } else {
      items = records.map((record) =>
        PromotedMemorySearchResultItemSchema.parse({
          record,
          score: lexicalScore(record.content, query.text),
        }),
      );
    }

    return PromotedMemorySearchResultSchema.parse({
      entries: items.sort(sortPromotedSearchResults).slice(0, query.topK),
    });
  }

  private async requireActiveNamespace(
    namespace: string,
  ): Promise<PublicMcpNamespaceRecord> {
    const record = await this.options.namespaceStore.get(namespace);
    if (!record) {
      throw new NousError(`Unknown source namespace ${namespace}`, 'NAMESPACE_UNAUTHORIZED');
    }
    if (record.lifecycleState !== 'active') {
      throw new NousError(
        `Source namespace ${namespace} is ${record.lifecycleState} and cannot be promoted`,
        'SOURCE_QUARANTINED',
        {
          namespace,
          lifecycleState: record.lifecycleState,
        },
      );
    }
    return record;
  }

  private async requireSourceContext(
    namespaceRecord: PublicMcpNamespaceRecord,
    sourceRecordId: string,
    expectedTier?: PublicMcpMemoryTier,
  ): Promise<{
    entry: ExternalSourceMemoryEntry;
    sourceRecordKey: string;
    sourceCollection: string;
    sourceSupersedesRecordId?: string;
  }> {
    const entries = await this.options.storageAdapter.queryEntries(namespaceRecord, 'both');
    const entry = entries.find(
      (candidate) =>
        candidate.id === sourceRecordId &&
        (expectedTier === undefined || candidate.tier === expectedTier),
    );
    if (!entry) {
      throw new NousError(
        `Source record ${sourceRecordId} is unavailable for promotion`,
        'VALIDATION_ERROR',
      );
    }

    const prior = entries.find((candidate) => candidate.supersededBy === entry.id);
    return {
      entry,
      sourceRecordKey: `${namespaceRecord.namespace}:${entry.id}`,
      sourceCollection:
        entry.tier === 'stm'
          ? namespaceRecord.stmCollection
          : namespaceRecord.ltmCollection,
      sourceSupersedesRecordId: prior?.id,
    };
  }

  private async findActiveBySourceKey(
    sourceRecordKey: string,
  ): Promise<PromotedMemoryRecord | null> {
    const rows = await this.options.documentStore.query<unknown>(
      PROMOTED_MEMORY_COLLECTION,
      {},
    );
    const found = rows
      .map((row) => PromotedMemoryRecordSchema.parse(row))
      .find(
        (record) =>
          record.sourceRecordKey === sourceRecordKey &&
          record.lifecycleStatus === 'active',
      );
    return found ?? null;
  }

  private async requirePromotedRecord(promotedId: string): Promise<PromotedMemoryRecord> {
    const record = await this.get({ promotedId, includeDemoted: true });
    if (!record) {
      throw new NousError(`Promoted record ${promotedId} was not found`, 'VALIDATION_ERROR');
    }
    return record;
  }

  private async evaluateConfidenceGovernance(
    promotedId: string,
    source: ExternalSourceMemoryEntry,
  ): Promise<ConfidenceGovernanceEvaluationResult> {
    if (this.options.pfc) {
      return this.options.pfc.evaluateConfidenceGovernance(
        buildConfidenceGovernanceInput(promotedId, source),
      );
    }

    return ConfidenceGovernanceEvaluationResultSchema.parse({
      outcome: 'allow_with_flag',
      reasonCode: 'CGR-ALLOW-WITH-FLAG',
      governance: 'should',
      actionCategory: 'memory-write',
      patternId: promotedId as ConfidenceGovernanceEvaluationResult['patternId'],
      confidence: 0.72,
      confidenceTier: 'medium',
      supportingSignals: 5,
      autonomyAllowed: false,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      explanation: {
        patternId: promotedId as ConfidenceGovernanceEvaluationResult['patternId'],
        outcomeRef: `promoted:${promotedId}`,
        evidenceRefs: [{ actionCategory: 'memory-write' }],
      },
    });
  }

  private async rejectPromotion(
    requestId: string,
    timestamp: string,
    command: PromoteExternalRecordCommand,
    reason: string,
  ): Promise<never> {
    const authorization = await this.appendAuthorization(
      `promoted-memory:promote:rejected:${command.sourceRecordId}`,
      {
        requestId,
        sourceNamespace: command.sourceNamespace,
        sourceRecordId: command.sourceRecordId,
        reason,
      },
      'denied',
    );
    const completion = await this.appendCompletion(
      `promoted-memory:promote:rejected:${command.sourceRecordId}`,
      authorization,
      {
        requestId,
        sourceNamespace: command.sourceNamespace,
        sourceRecordId: command.sourceRecordId,
        reason,
      },
      'blocked',
    );
    await this.writeAudit({
      id: `${requestId}:promote:rejected`,
      requestId,
      action: 'promote',
      outcome: 'rejected',
      sourceNamespace: command.sourceNamespace,
      sourceRecordId: command.sourceRecordId,
      rationale: command.rationale,
      reason,
      authorizationEventId: authorization,
      completionEventId: completion,
      createdAt: timestamp,
    });
    throw new NousError(reason, 'VALIDATION_ERROR');
  }

  private async rejectDemotion(
    requestId: string,
    timestamp: string,
    command: DemotePromotedRecordCommand,
    reason: string,
  ): Promise<never> {
    const authorization = await this.appendAuthorization(
      `promoted-memory:demote:rejected:${command.promotedId}`,
      {
        requestId,
        promotedId: command.promotedId,
        reason,
      },
      'denied',
    );
    const completion = await this.appendCompletion(
      `promoted-memory:demote:rejected:${command.promotedId}`,
      authorization,
      {
        requestId,
        promotedId: command.promotedId,
        reason,
      },
      'blocked',
    );
    await this.writeAudit({
      id: `${requestId}:demote:rejected`,
      requestId,
      action: 'demote',
      outcome: 'rejected',
      promotedId: command.promotedId,
      rationale: command.rationale,
      reason,
      authorizationEventId: authorization,
      completionEventId: completion,
      createdAt: timestamp,
    });
    throw new NousError(reason, 'VALIDATION_ERROR');
  }

  private async writeAudit(record: PromotedMemoryAuditRecord): Promise<void> {
    const parsed = PromotedMemoryAuditRecordSchema.parse(record);
    await this.options.documentStore.put(PROMOTED_MEMORY_AUDIT_COLLECTION, parsed.id, parsed);
  }

  private async upsertVector(record: PromotedMemoryRecord): Promise<void> {
    if (!this.options.vectorStore || !this.options.embedder) {
      return;
    }

    const vector = await this.options.embedder.embed(record.content);
    await this.options.vectorStore.upsert(
      PROMOTED_MEMORY_VECTOR_COLLECTION,
      record.id,
      vector,
      {
        lifecycleStatus: record.lifecycleStatus,
        sourceNamespace: record.provenance.sourceNamespace,
        updatedAt: record.updatedAt,
      },
    );
  }

  private async deleteVector(promotedId: string): Promise<void> {
    if (!this.options.vectorStore) {
      return;
    }
    await this.options.vectorStore.delete(PROMOTED_MEMORY_VECTOR_COLLECTION, promotedId);
  }

  private async appendAuthorization(
    actionRef: string,
    detail: Record<string, unknown>,
    status: 'approved' | 'denied' = 'approved',
  ): Promise<PromotedMemoryAuditRecord['authorizationEventId']> {
    if (!this.options.witnessService) {
      return undefined;
    }
    const event = await this.options.witnessService.appendAuthorization({
      actionCategory: 'memory-write',
      actionRef,
      actor: 'subcortex',
      status,
      detail,
    });
    return event.id;
  }

  private async appendCompletion(
    actionRef: string,
    authorizationRef: PromotedMemoryAuditRecord['authorizationEventId'],
    detail: Record<string, unknown>,
    status: 'succeeded' | 'failed' | 'blocked',
  ): Promise<PromotedMemoryAuditRecord['completionEventId']> {
    if (!this.options.witnessService || !authorizationRef) {
      return undefined;
    }
    const event = await this.options.witnessService.appendCompletion({
      actionCategory: 'memory-write',
      actionRef,
      authorizationRef: authorizationRef as any,
      actor: 'subcortex',
      status,
      detail,
    });
    return event.id;
  }
}

function derivePromotedKind(source: ExternalSourceMemoryEntry): PromotedMemoryRecord['kind'] {
  if (source.tags.includes('fact') || source.sourceOperation === 'compact_extract_facts') {
    return 'fact';
  }
  if (source.tags.includes('summary') || source.sourceOperation === 'compact_summary') {
    return 'summary';
  }
  return 'document';
}

function buildProvenance(input: {
  sourceContext: {
    entry: ExternalSourceMemoryEntry;
    sourceRecordKey: string;
    sourceCollection: string;
    sourceSupersedesRecordId?: string;
  };
  promotedAt: string;
}): PromotedSourceProvenance {
  const { sourceContext, promotedAt } = input;
  return {
    sourceNamespace: sourceContext.entry.namespace,
    sourceRecordId: sourceContext.entry.id,
    sourceRecordKey: sourceContext.sourceRecordKey,
    sourceTier: sourceContext.entry.tier,
    sourceCollection: sourceContext.sourceCollection,
    sourceLifecycleStatus: sourceContext.entry.lifecycleStatus,
    sourceOperation: sourceContext.entry.sourceOperation,
    sourceCreatedAt: sourceContext.entry.createdAt,
    sourceUpdatedAt: sourceContext.entry.updatedAt,
    sourceDeletedAt: sourceContext.entry.deletedAt,
    sourceSupersedesRecordId: sourceContext.sourceSupersedesRecordId,
    sourceSupersededByRecordId: sourceContext.entry.supersededBy,
    promotedAt,
    promotedBySubject: 'Cortex::System',
  };
}

function buildConfidenceGovernanceInput(
  promotedId: string,
  source: ExternalSourceMemoryEntry,
): ConfidenceGovernanceEvaluationInput {
  const confidence = source.tier === 'ltm' || source.sourceOperation === 'compact_extract_facts'
    ? 0.92
    : source.tags.includes('summary')
      ? 0.68
      : 0.76;
  const supportingSignals = Math.max(5, source.tags.length + 4);
  const evidenceRefs: TraceEvidenceReference[] = [{ actionCategory: 'memory-write' }];

  return {
    governance: 'should',
    actionCategory: 'memory-write',
    pattern: {
      id: promotedId as any,
      content: source.content,
      confidence,
      basedOn: [source.id as any],
      supersedes: source.supersededBy ? [source.supersededBy as any] : [],
      evidenceRefs,
      scope: 'global',
      tags: source.tags,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    },
    confidenceSignal: {
      tier:
        confidence >= 0.9 ? 'high' : confidence >= 0.6 ? 'medium' : 'low',
      confidence,
      supportingSignals,
      patternId: promotedId as any,
      entryId: promotedId as any,
      decayState: 'stable',
    },
    explanation: {
      patternId: promotedId as any,
      outcomeRef: `promoted:${promotedId}`,
      evidenceRefs,
    },
  };
}

function matchesPromotedQuery(
  record: PromotedMemoryRecord,
  query: PromotedMemorySearchQuery,
): boolean {
  if (!query.includeDemoted && record.lifecycleStatus === 'demoted') {
    return false;
  }
  if (
    query.sourceNamespace &&
    record.provenance.sourceNamespace !== query.sourceNamespace
  ) {
    return false;
  }
  return true;
}

function lexicalScore(content: string, query: string): number {
  const haystack = tokenize(content);
  const needles = Array.from(tokenize(query));
  if (needles.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of needles) {
    if (haystack.has(token)) {
      matches += 1;
    }
  }
  return matches / needles.length;
}

function tokenize(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function sortPromotedSearchResults(
  left: PromotedMemorySearchResultItem,
  right: PromotedMemorySearchResultItem,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.record.updatedAt !== left.record.updatedAt) {
    return right.record.updatedAt.localeCompare(left.record.updatedAt);
  }
  return left.record.id.localeCompare(right.record.id);
}
