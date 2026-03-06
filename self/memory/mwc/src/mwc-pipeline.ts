/**
 * MwcPipeline — MemoryWriteCandidate flow with governed mutation controls.
 *
 * Supports create/supersede/delete/promotion/compaction mutation paths with
 * audit and tombstone artifacts, while keeping submit/list/export compatibility.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  IDocumentStore,
  IStmStore,
  IVectorStore,
  IEmbedder,
  MemoryWriteCandidate,
  MemoryEntry,
  MemoryEntryId,
  ProjectId,
  StmContext,
  MemoryMutationRequest,
  MemoryMutationAuditRecord,
  MemoryTombstone,
  MemoryMutationId,
  MemoryTombstoneId,
  MemoryMutationReasonCode,
  MemoryMutationAction,
  MemoryMutationOutcome,
  EmbeddingModelProvenance,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  MemoryWriteCandidateSchema,
  ExperienceRecordWriteCandidateSchema,
  MemoryEntrySchema,
  MemoryMutationRequestSchema,
  MemoryMutationAuditRecordSchema,
  MemoryTombstoneSchema,
  ValidationError,
} from '@nous/shared';
import { DeterministicEmbeddingPipeline } from '@nous/autonomic-embeddings';
import {
  createStubMutationEvaluator,
  type MwcEvaluator,
  type MemoryMutationEvaluator,
} from './evaluator.js';

const COLLECTION = 'memory_entries';
const AUDIT_COLLECTION = 'memory_mutation_audit';
const TOMBSTONE_COLLECTION = 'memory_tombstones';
const DEFAULT_VECTOR_COLLECTION = 'memory';

export interface MwcPipelineOptions {
  idFactory?: () => string;
  now?: () => string;
  vectorIndexing?: MwcVectorIndexingOptions;
}

export interface MwcVectorIndexingOptions {
  vectorStore: IVectorStore;
  embedder: IEmbedder;
  profile: EmbeddingModelProvenance;
  collection?: string;
  buildEvidenceRefs?: (entry: MemoryEntry) => TraceEvidenceReference[];
}

interface MwcVectorIndexingRuntime {
  vectorStore: IVectorStore;
  collection: string;
  pipeline: DeterministicEmbeddingPipeline;
  buildEvidenceRefs: (entry: MemoryEntry) => TraceEvidenceReference[];
}

export interface MutationResult {
  applied: boolean;
  mutationId: MemoryMutationId;
  reason: string;
  reasonCode: MemoryMutationReasonCode;
  resultingEntryId?: MemoryEntryId;
  tombstoneId?: MemoryTombstoneId;
}

function candidateToEntry(input: {
  candidate: MemoryWriteCandidate;
  projectId?: ProjectId;
  now: string;
  mutationId: MemoryMutationId;
  id: MemoryEntryId;
}): MemoryEntry & Record<string, unknown> {
  const { candidate, projectId, now, mutationId, id } = input;
  const entryProjectId = projectId ?? candidate.projectId;
  const placementState = candidate.scope === 'global'
    ? 'global-probation'
    : 'project';

  const base: MemoryEntry & Record<string, unknown> = {
    id,
    content: candidate.content,
    type: candidate.type,
    scope: candidate.scope,
    projectId: entryProjectId,
    confidence: candidate.confidence,
    sensitivity: candidate.sensitivity,
    retention: candidate.retention,
    provenance: candidate.provenance,
    sentiment: candidate.sentiment,
    tags: candidate.tags,
    createdAt: now,
    updatedAt: now,
    mutabilityClass: candidate.mutabilityClass ?? 'domain-versioned',
    lifecycleStatus: 'active',
    supersededBy: undefined,
    deletedAt: undefined,
    tombstoneId: undefined,
    placementState,
    lastMutationId: mutationId,
    embedding: undefined,
  };

  if (
    candidate.type === 'experience-record' &&
    candidate.context != null &&
    candidate.action != null &&
    candidate.outcome != null &&
    candidate.reason != null
  ) {
    base.context = candidate.context;
    base.action = candidate.action;
    base.outcome = candidate.outcome;
    base.reason = candidate.reason;
  }

  return base;
}

export class MwcPipeline {
  private readonly idFactory: () => string;

  private readonly now: () => string;

  private readonly vectorIndexing?: MwcVectorIndexingRuntime;

  constructor(
    private readonly documentStore: IDocumentStore,
    private readonly stmStore: IStmStore,
    private readonly evaluator: MwcEvaluator,
    private readonly mutationEvaluator: MemoryMutationEvaluator = createStubMutationEvaluator(),
    options: MwcPipelineOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    if (options.vectorIndexing) {
      this.vectorIndexing = {
        vectorStore: options.vectorIndexing.vectorStore,
        collection:
          options.vectorIndexing.collection ?? DEFAULT_VECTOR_COLLECTION,
        pipeline: new DeterministicEmbeddingPipeline({
          embedder: options.vectorIndexing.embedder,
          profile: options.vectorIndexing.profile,
          idFactory: this.idFactory,
          now: this.now,
        }),
        buildEvidenceRefs:
          options.vectorIndexing.buildEvidenceRefs ??
          (() => [{ actionCategory: 'memory-write' }]),
      };
    }
  }

  async submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null> {
    const parseResult = MemoryWriteCandidateSchema.safeParse(candidate);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid MemoryWriteCandidate', errors);
    }
    const validated = parseResult.data;

    if (validated.type === 'experience-record') {
      const expResult = ExperienceRecordWriteCandidateSchema.safeParse(validated);
      if (!expResult.success) {
        const errors = expResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        throw new ValidationError(
          'Invalid ExperienceRecordWriteCandidate: experience-record requires sentiment, context, action, outcome, reason',
          errors,
        );
      }
    }
    const evalResult = await this.evaluator(validated, projectId);
    const mutationId = this.makeMutationId();
    const now = this.now();

    if (!evalResult.approved) {
      await this.appendAuditRecord({
        id: mutationId,
        action: 'create',
        actor: 'pfc',
        outcome: 'denied',
        reasonCode: normalizeReasonCode(
          evalResult.reason,
          'MEM-CREATE-DENIED',
        ),
        reason: evalResult.reason ?? 'denied',
        projectId: projectId ?? validated.projectId,
        targetEntryId: undefined,
        resultingEntryId: undefined,
        tombstoneId: undefined,
        traceId: validated.provenance.traceId,
        evidenceRefs: [],
        occurredAt: now,
      });
      console.info(
        `[nous:mwc] denied projectId=${projectId ?? 'global'} reason=${evalResult.reason ?? 'unspecified'}`,
      );
      return null;
    }

    const entry = candidateToEntry({
      candidate: validated,
      projectId,
      now,
      mutationId,
      id: this.makeMemoryEntryId(),
    });
    const preparedEntry = await this.prepareVectorIndexing(entry);
    try {
      await this.documentStore.put(COLLECTION, preparedEntry.id, preparedEntry);
    } catch (error) {
      await this.rollbackVectorIndex(preparedEntry.id);
      throw error;
    }
    await this.appendAuditRecord({
      id: mutationId,
      action: 'create',
      actor: 'pfc',
      outcome: 'applied',
      reasonCode: normalizeReasonCode(evalResult.reason, 'MEM-CREATE-APPLIED'),
      reason: evalResult.reason ?? 'approved',
      projectId: preparedEntry.projectId,
      targetEntryId: undefined,
      resultingEntryId: preparedEntry.id,
      tombstoneId: undefined,
      traceId: preparedEntry.provenance.traceId,
      evidenceRefs: [],
      occurredAt: now,
    });

    console.info(
      `[nous:mwc] persisted projectId=${preparedEntry.projectId ?? 'global'} entryId=${preparedEntry.id}`,
    );
    return preparedEntry.id;
  }

  async mutate(
    request: MemoryMutationRequest,
    projectId?: ProjectId,
  ): Promise<MutationResult> {
    const parsed = MemoryMutationRequestSchema.safeParse({
      ...request,
      projectId: request.projectId ?? projectId,
    });
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid MemoryMutationRequest', errors);
    }

    let normalized = parsed.data;
    if (!normalized.projectId && normalized.targetEntryId) {
      const target = await this.readEntry(normalized.targetEntryId);
      if (target?.projectId) {
        normalized = { ...normalized, projectId: target.projectId };
      }
    }
    const mutationId = normalized.id ?? this.makeMutationId();
    const now = normalized.requestedAt ?? this.now();
    const decision = await this.mutationEvaluator(
      { ...normalized, id: mutationId },
      normalized.projectId,
    );

    if (!decision.approved) {
      const deniedCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        'MEM-MUTATION-DENIED',
      );
      await this.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'denied',
        reasonCode: deniedCode,
        reason: decision.reason ?? 'denied',
        projectId: normalized.projectId,
        targetEntryId: normalized.targetEntryId,
        resultingEntryId: undefined,
        tombstoneId: undefined,
        traceId: normalized.traceId,
        evidenceRefs: normalized.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: decision.reason ?? 'denied',
        reasonCode: deniedCode,
      };
    }

    try {
      const applied = await this.applyMutation({
        request: { ...normalized, id: mutationId, requestedAt: now },
        mutationId,
        now,
      });

      await this.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'applied',
        reasonCode: normalizeReasonCode(
          decision.reasonCode ?? decision.reason,
          defaultReasonCode(normalized.action, 'applied'),
        ),
        reason: decision.reason ?? 'approved',
        projectId: normalized.projectId,
        targetEntryId: normalized.targetEntryId,
        resultingEntryId: applied.resultingEntryId,
        tombstoneId: applied.tombstoneId,
        traceId: normalized.traceId,
        evidenceRefs: normalized.evidenceRefs,
        occurredAt: now,
      });

      return {
        applied: true,
        mutationId,
        reason: decision.reason ?? 'approved',
        reasonCode: normalizeReasonCode(
          decision.reasonCode ?? decision.reason,
          defaultReasonCode(normalized.action, 'applied'),
        ),
        resultingEntryId: applied.resultingEntryId,
        tombstoneId: applied.tombstoneId,
      };
    } catch (error) {
      const failedCode = normalizeReasonCode(
        undefined,
        defaultReasonCode(normalized.action, 'failed'),
      );
      await this.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'failed',
        reasonCode: failedCode,
        reason: normalizeErrorMessage(error),
        projectId: normalized.projectId,
        targetEntryId: normalized.targetEntryId,
        resultingEntryId: undefined,
        tombstoneId: undefined,
        traceId: normalized.traceId,
        evidenceRefs: normalized.evidenceRefs,
        occurredAt: now,
      });

      return {
        applied: false,
        mutationId,
        reason: normalizeErrorMessage(error),
        reasonCode: failedCode,
      };
    }
  }

  async listForProject(projectId: ProjectId): Promise<MemoryEntry[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { projectId } },
    );

    const entries: MemoryEntry[] = [];
    for (const item of raw) {
      const parsed = MemoryEntrySchema.safeParse(item);
      if (parsed.success) {
        entries.push(parsed.data);
      }
    }

    return entries.sort(sortEntries);
  }

  async listMutationAudit(
    projectId?: ProjectId,
  ): Promise<MemoryMutationAuditRecord[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      AUDIT_COLLECTION,
      projectId ? { where: { projectId } } : {},
    );
    const records: MemoryMutationAuditRecord[] = [];
    for (const item of raw) {
      const parsed = MemoryMutationAuditRecordSchema.safeParse(item);
      if (parsed.success) {
        records.push(parsed.data);
      }
    }
    return records.sort((a, b) => a.sequence - b.sequence);
  }

  async listTombstones(projectId?: ProjectId): Promise<MemoryTombstone[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      TOMBSTONE_COLLECTION,
      projectId ? { where: { projectId } } : {},
    );
    const tombstones: MemoryTombstone[] = [];
    for (const item of raw) {
      const parsed = MemoryTombstoneSchema.safeParse(item);
      if (parsed.success) {
        tombstones.push(parsed.data);
      }
    }
    return tombstones.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async exportForProject(
    projectId: ProjectId,
  ): Promise<{
      stm: StmContext;
      entries: MemoryEntry[];
      audit: MemoryMutationAuditRecord[];
      tombstones: MemoryTombstone[];
    }> {
    const stm = await this.stmStore.getContext(projectId);
    const entries = await this.listForProject(projectId);
    const audit = await this.listMutationAudit(projectId);
    const tombstones = await this.listTombstones(projectId);

    console.debug(
      `[nous:memory] export projectId=${projectId} entries=${entries.length} audit=${audit.length} tombstones=${tombstones.length}`,
    );
    return { stm, entries, audit, tombstones };
  }

  async deleteEntry(id: MemoryEntryId): Promise<boolean> {
    const existing = await this.readEntry(id);
    const result = await this.mutate({
      action: 'soft-delete',
      actor: 'operator',
      targetEntryId: id,
      projectId: existing?.projectId,
      reason: 'operator delete entry',
      traceId: existing?.provenance.traceId,
      evidenceRefs: [],
    });
    console.info(
      `[nous:memory] delete entryId=${id} applied=${result.applied} reasonCode=${result.reasonCode}`,
    );
    return result.applied;
  }

  async deleteAllForProject(projectId: ProjectId): Promise<number> {
    const entries = await this.listForProject(projectId);

    let count = 0;
    for (const entry of entries) {
      if (entry.lifecycleStatus !== 'active') {
        continue;
      }
      const result = await this.mutate({
        action: 'soft-delete',
        actor: 'operator',
        targetEntryId: entry.id,
        projectId,
        reason: 'operator delete all for project',
        traceId: entry.provenance.traceId,
        evidenceRefs: [],
      });
      if (result.applied) {
        count++;
      }
    }

    await this.stmStore.clear(projectId);
    console.info(
      `[nous:memory] deleteAllForProject projectId=${projectId} count=${count}`,
    );
    return count;
  }

  private async applyMutation(input: {
    request: MemoryMutationRequest & { id: MemoryMutationId; requestedAt: string };
    mutationId: MemoryMutationId;
    now: string;
  }): Promise<{ resultingEntryId?: MemoryEntryId; tombstoneId?: MemoryTombstoneId }> {
    const { request, mutationId, now } = input;

    switch (request.action) {
      case 'create': {
        if (!request.replacementCandidate) {
          throw new Error('MEM-REPLACEMENT-CANDIDATE-REQUIRED');
        }
        const result = await this.persistCandidate(
          request.replacementCandidate,
          request.projectId,
          mutationId,
          now,
        );
        return { resultingEntryId: result.id };
      }
      case 'supersede': {
        if (!request.targetEntryId) {
          throw new Error('MEM-TARGET-REQUIRED');
        }
        if (!request.replacementCandidate) {
          throw new Error('MEM-REPLACEMENT-CANDIDATE-REQUIRED');
        }
        const previous = await this.readEntryOrThrow(request.targetEntryId);
        if (previous.mutabilityClass !== 'domain-versioned') {
          throw new Error('MEM-MUTABILITY-NOT-VERSIONED');
        }
        if (previous.lifecycleStatus !== 'active') {
          throw new Error('MEM-TARGET-NOT-ACTIVE');
        }

        const next = await this.persistCandidate(
          {
            ...request.replacementCandidate,
            mutabilityClass:
              request.replacementCandidate.mutabilityClass ??
              previous.mutabilityClass,
          },
          request.projectId ?? previous.projectId,
          mutationId,
          now,
        );

        const updatedPrevious: MemoryEntry = {
          ...previous,
          lifecycleStatus: 'superseded',
          supersededBy: next.id,
          updatedAt: now,
          lastMutationId: mutationId,
        };
        await this.documentStore.put(
          COLLECTION,
          updatedPrevious.id,
          updatedPrevious,
        );
        return { resultingEntryId: next.id };
      }
      case 'soft-delete':
      case 'hard-delete': {
        if (!request.targetEntryId) {
          throw new Error('MEM-TARGET-REQUIRED');
        }
        const existing = await this.readEntryOrThrow(request.targetEntryId);

        if (
          request.action === 'hard-delete' &&
          (existing.mutabilityClass === 'evidence-immutable' ||
            existing.mutabilityClass === 'deletion-tombstone')
        ) {
          throw new Error('MEM-IMMUTABLE-TARGET');
        }

        let tombstoneId: MemoryTombstoneId | undefined;
        if (request.action === 'hard-delete') {
          tombstoneId = this.makeTombstoneId();
          const tombstone: MemoryTombstone = {
            id: tombstoneId,
            targetEntryId: existing.id,
            targetContentHash: sha256(existing.content),
            deletedByMutationId: mutationId,
            projectId: existing.projectId,
            reason: request.reason,
            createdAt: now,
          };
          await this.documentStore.put(TOMBSTONE_COLLECTION, tombstone.id, tombstone);
        }

        const updated: MemoryEntry = {
          ...existing,
          lifecycleStatus:
            request.action === 'hard-delete' ? 'hard-deleted' : 'soft-deleted',
          deletedAt: now,
          tombstoneId,
          content: request.action === 'hard-delete' ? '[hard-deleted]' : existing.content,
          updatedAt: now,
          lastMutationId: mutationId,
        };
        await this.documentStore.put(COLLECTION, updated.id, updated);
        return { resultingEntryId: updated.id, tombstoneId };
      }
      case 'promote-global':
      case 'demote-project': {
        if (!request.targetEntryId) {
          throw new Error('MEM-TARGET-REQUIRED');
        }
        const existing = await this.readEntryOrThrow(request.targetEntryId);
        const promoted = request.action === 'promote-global';

        const updated: MemoryEntry = {
          ...existing,
          scope: promoted ? 'global' : 'project',
          projectId: promoted ? undefined : request.projectId ?? existing.projectId,
          placementState: promoted ? 'global-probation' : 'project',
          updatedAt: now,
          lastMutationId: mutationId,
        };

        await this.documentStore.put(COLLECTION, updated.id, updated);
        return { resultingEntryId: updated.id };
      }
      case 'compact-stm': {
        const targetProjectId = request.projectId;
        if (!targetProjectId) {
          throw new Error('MEM-PROJECT-REQUIRED');
        }
        await this.stmStore.compact(targetProjectId);
        return {};
      }
      default:
        throw new Error('MEM-ACTION-NOT-SUPPORTED');
    }
  }

  private async prepareVectorIndexing(entry: MemoryEntry): Promise<MemoryEntry> {
    if (!this.vectorIndexing) {
      return entry;
    }
    const embedded = await this.vectorIndexing.pipeline.embedText(entry.content);
    const metadata = this.vectorIndexing.pipeline.buildIndexMetadata({
      memoryEntryId: entry.id,
      memoryType: entry.type,
      scope: entry.scope,
      projectId: entry.projectId,
      traceId: entry.provenance.traceId,
      evidenceRefs: this.vectorIndexing.buildEvidenceRefs(entry),
      tokenEstimate: embedded.tokenEstimate,
      generation: embedded.generation,
    });
    await this.vectorIndexing.vectorStore.upsert(
      this.vectorIndexing.collection,
      entry.id,
      embedded.vector,
      metadata as unknown as Record<string, unknown>,
    );
    return {
      ...entry,
      embedding: embedded.vector,
    };
  }

  private async rollbackVectorIndex(id: MemoryEntryId): Promise<void> {
    if (!this.vectorIndexing) return;
    try {
      await this.vectorIndexing.vectorStore.delete(
        this.vectorIndexing.collection,
        id,
      );
    } catch {
      // Best-effort compensation. Primary error is surfaced to caller.
    }
  }

  private async persistCandidate(
    candidate: MemoryWriteCandidate,
    projectId: ProjectId | undefined,
    mutationId: MemoryMutationId,
    now: string,
  ): Promise<MemoryEntry> {
    const parsed = MemoryWriteCandidateSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid MemoryWriteCandidate', errors);
    }
    const entry = candidateToEntry({
      candidate: parsed.data,
      projectId,
      now,
      mutationId,
      id: this.makeMemoryEntryId(),
    });
    const preparedEntry = await this.prepareVectorIndexing(entry);
    try {
      await this.documentStore.put(
        COLLECTION,
        preparedEntry.id,
        preparedEntry,
      );
    } catch (error) {
      await this.rollbackVectorIndex(preparedEntry.id);
      throw error;
    }
    return preparedEntry;
  }

  private async readEntry(id: MemoryEntryId): Promise<MemoryEntry | null> {
    const raw = await this.documentStore.get<Record<string, unknown>>(COLLECTION, id);
    if (!raw) {
      return null;
    }
    const parsed = MemoryEntrySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private async readEntryOrThrow(id: MemoryEntryId): Promise<MemoryEntry> {
    const entry = await this.readEntry(id);
    if (!entry) {
      throw new Error('MEM-TARGET-NOT-FOUND');
    }
    return entry;
  }

  private async nextAuditSequence(): Promise<number> {
    const records = await this.listMutationAudit();
    if (!records.length) {
      return 1;
    }
    return records[records.length - 1].sequence + 1;
  }

  private async appendAuditRecord(input: {
    id: MemoryMutationId;
    action: MemoryMutationAction;
    actor: MemoryMutationRequest['actor'];
    outcome: MemoryMutationOutcome;
    reasonCode: MemoryMutationReasonCode;
    reason: string;
    projectId?: ProjectId;
    targetEntryId?: MemoryEntryId;
    resultingEntryId?: MemoryEntryId;
    tombstoneId?: MemoryTombstoneId;
    traceId?: MemoryMutationRequest['traceId'];
    evidenceRefs: MemoryMutationRequest['evidenceRefs'];
    occurredAt: string;
  }): Promise<void> {
    const sequence = await this.nextAuditSequence();
    const parsed = MemoryMutationAuditRecordSchema.safeParse({
      id: input.id,
      sequence,
      action: input.action,
      actor: input.actor,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      reason: input.reason,
      projectId: input.projectId,
      targetEntryId: input.targetEntryId,
      resultingEntryId: input.resultingEntryId,
      tombstoneId: input.tombstoneId,
      traceId: input.traceId,
      evidenceRefs: input.evidenceRefs,
      occurredAt: input.occurredAt,
    });
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid MemoryMutationAuditRecord', errors);
    }
    await this.documentStore.put(AUDIT_COLLECTION, parsed.data.id, parsed.data);
  }

  private makeMemoryEntryId(): MemoryEntryId {
    return this.idFactory() as MemoryEntryId;
  }

  private makeMutationId(): MemoryMutationId {
    return this.idFactory() as MemoryMutationId;
  }

  private makeTombstoneId(): MemoryTombstoneId {
    return this.idFactory() as MemoryTombstoneId;
  }
}

function sortEntries(a: MemoryEntry, b: MemoryEntry): number {
  if (a.createdAt === b.createdAt) {
    return a.id.localeCompare(b.id);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

function normalizeReasonCode(
  input: string | undefined,
  fallback: MemoryMutationReasonCode,
): MemoryMutationReasonCode {
  if (input && /^MEM-[A-Z0-9][A-Z0-9-]*$/.test(input)) {
    return input as MemoryMutationReasonCode;
  }
  return fallback;
}

function defaultReasonCode(
  action: MemoryMutationAction,
  outcome: 'applied' | 'failed',
): MemoryMutationReasonCode {
  const actionName = action.toUpperCase();
  const suffix = outcome === 'applied' ? 'APPLIED' : 'FAILED';
  return `MEM-${actionName}-${suffix}` as MemoryMutationReasonCode;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
