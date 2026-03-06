/**
 * MwcPipeline — MemoryWriteCandidate flow with governed mutation controls.
 *
 * Preserves the existing ingress-facing API while delegating durable memory
 * ownership to @nous/memory-ltm.
 */
import { randomUUID } from 'node:crypto';
import { DeterministicEmbeddingPipeline } from '@nous/autonomic-embeddings';
import type {
  IDocumentStore,
  IEmbedder,
  IStmStore,
  IVectorStore,
  MemoryEntry,
  MemoryEntryId,
  MemoryMutationAuditRecord,
  MemoryMutationId,
  MemoryMutationReasonCode,
  MemoryMutationRequest,
  MemoryTombstone,
  MemoryTombstoneId,
  MemoryWriteCandidate,
  ProjectId,
  StmContext,
  TraceEvidenceReference,
  EmbeddingModelProvenance,
} from '@nous/shared';
import {
  ExperienceRecordWriteCandidateSchema,
  MemoryMutationRequestSchema,
  MemoryWriteCandidateSchema,
  ValidationError,
} from '@nous/shared';
import {
  DocumentLtmStore,
  GovernedTypedLtmRuntime,
  type GovernedTypedLtmPolicyOptions,
  type LtmVectorIndexingOptions,
  type TypedLtmWriteCandidate,
} from '@nous/memory-ltm';
import {
  createStubMutationEvaluator,
  type MwcEvaluator,
  type MemoryMutationEvaluator,
} from './evaluator.js';

export interface MwcPipelineOptions {
  idFactory?: () => string;
  now?: () => string;
  policy?: MwcPolicyOptions;
  vectorIndexing?: MwcVectorIndexingOptions;
}

export type MwcPolicyOptions = GovernedTypedLtmPolicyOptions;
export type MwcVectorIndexingOptions = LtmVectorIndexingOptions;

interface MwcVectorIndexingRuntime {
  vectorStore: IVectorStore;
  collection: string;
  pipeline: DeterministicEmbeddingPipeline;
  buildEvidenceRefs: (entry: MemoryEntry) => TraceEvidenceReference[];
}

const DEFAULT_VECTOR_COLLECTION = 'memory';

export interface MutationResult {
  applied: boolean;
  mutationId: MemoryMutationId;
  reason: string;
  reasonCode: MemoryMutationReasonCode;
  resultingEntryId?: MemoryEntryId;
  tombstoneId?: MemoryTombstoneId;
}

export class MwcPipeline {
  private readonly idFactory: () => string;

  private readonly now: () => string;

  private readonly ltmStore: DocumentLtmStore;

  private readonly typedRuntime: GovernedTypedLtmRuntime;

  private readonly vectorIndexing?: MwcVectorIndexingRuntime;

  constructor(
    documentStore: IDocumentStore,
    private readonly stmStore: IStmStore,
    private readonly evaluator: MwcEvaluator,
    private readonly mutationEvaluator: MemoryMutationEvaluator = createStubMutationEvaluator(),
    options: MwcPipelineOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.ltmStore = new DocumentLtmStore(documentStore, { now: this.now });
    this.typedRuntime = new GovernedTypedLtmRuntime(this.ltmStore, {
      idFactory: this.idFactory,
      now: this.now,
      mutationGuard: this.mutationEvaluator,
      vectorIndexing: options.vectorIndexing,
      policy: options.policy,
    });
    this.vectorIndexing = buildVectorRuntime(
      options.vectorIndexing,
      this.idFactory,
      this.now,
    );
  }

  async submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null> {
    const validated = parseCandidate(candidate);
    const evalResult = await this.evaluator(validated, projectId);

    if (isTypedCandidate(validated)) {
      const result = await this.typedRuntime.write({
        candidate: validated as TypedLtmWriteCandidate,
        projectId,
        actingProjectId: projectId,
        actor: 'pfc',
        decision: {
          approved: evalResult.approved,
          reason: evalResult.reason,
        },
        traceId: validated.provenance.traceId,
        evidenceRefs: [],
      });
      return result.applied ? result.resultingEntryId ?? null : null;
    }

    const mutationId = this.makeMutationId();
    const now = this.now();

    if (!evalResult.approved) {
      await this.ltmStore.appendAuditRecord({
        id: mutationId,
        action: 'create',
        actor: 'pfc',
        outcome: 'denied',
        reasonCode: normalizeReasonCode(
          evalResult.reason,
          'MEM-CREATE-DENIED',
        ),
        reason: evalResult.reason ?? 'denied',
        projectId: resolveEntryProjectId(validated, projectId),
        traceId: validated.provenance.traceId,
        evidenceRefs: [],
        occurredAt: now,
      });
      return null;
    }

    const entry = candidateToEntry({
      candidate: validated,
      projectId: resolveEntryProjectId(validated, projectId),
      now,
      mutationId,
      id: this.makeMemoryEntryId(),
    });
    const preparedEntry = await this.prepareVectorIndexing(entry);

    try {
      await this.ltmStore.write(preparedEntry);
    } catch (error) {
      await this.rollbackVectorIndex(preparedEntry.id);
      throw error;
    }

    await this.ltmStore.appendAuditRecord({
      id: mutationId,
      action: 'create',
      actor: 'pfc',
      outcome: 'applied',
      reasonCode: normalizeReasonCode(
        evalResult.reason,
        'MEM-CREATE-APPLIED',
      ),
      reason: evalResult.reason ?? 'approved',
      projectId: preparedEntry.projectId,
      resultingEntryId: preparedEntry.id,
      traceId: preparedEntry.provenance.traceId,
      evidenceRefs: [],
      occurredAt: now,
    });

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
      const errors = parsed.error.errors.map((error) => ({
        path: error.path.join('.'),
        message: error.message,
      }));
      throw new ValidationError('Invalid MemoryMutationRequest', errors);
    }

    if (parsed.data.action === 'compact-stm') {
      return this.compactStm(parsed.data);
    }

    return this.typedRuntime.mutate(parsed.data, projectId);
  }

  async listForProject(projectId: ProjectId): Promise<MemoryEntry[]> {
    return this.ltmStore.listForProject(projectId);
  }

  async listMutationAudit(
    projectId?: ProjectId,
  ): Promise<MemoryMutationAuditRecord[]> {
    return this.ltmStore.listMutationAudit(projectId);
  }

  async listTombstones(projectId?: ProjectId): Promise<MemoryTombstone[]> {
    return this.ltmStore.listTombstones(projectId);
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

    return { stm, entries, audit, tombstones };
  }

  async deleteEntry(id: MemoryEntryId): Promise<boolean> {
    const existing = await this.ltmStore.read(id);
    const result = await this.mutate({
      action: 'soft-delete',
      actor: 'operator',
      targetEntryId: id,
      projectId: existing?.projectId,
      reason: 'operator delete entry',
      traceId: existing?.provenance.traceId,
      evidenceRefs: [],
    });
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
    return count;
  }

  private async compactStm(
    request: MemoryMutationRequest,
  ): Promise<MutationResult> {
    const mutationId = request.id ?? this.makeMutationId();
    const now = request.requestedAt ?? this.now();
    const decision = await this.mutationEvaluator(
      { ...request, id: mutationId, requestedAt: now },
      request.projectId,
    );

    if (!decision.approved) {
      const reasonCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        'MEM-MUTATION-DENIED',
      );
      await this.ltmStore.appendAuditRecord({
        id: mutationId,
        action: 'compact-stm',
        actor: request.actor,
        outcome: 'denied',
        reasonCode,
        reason: decision.reason ?? 'denied',
        projectId: request.projectId,
        traceId: request.traceId,
        evidenceRefs: request.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: decision.reason ?? 'denied',
        reasonCode,
      };
    }

    try {
      if (!request.projectId) {
        throw new Error('MEM-PROJECT-REQUIRED');
      }
      await this.stmStore.compact(request.projectId);
      const reasonCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        'MEM-COMPACT-STM-APPLIED',
      );
      await this.ltmStore.appendAuditRecord({
        id: mutationId,
        action: 'compact-stm',
        actor: request.actor,
        outcome: 'applied',
        reasonCode,
        reason: decision.reason ?? 'approved',
        projectId: request.projectId,
        traceId: request.traceId,
        evidenceRefs: request.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: true,
        mutationId,
        reason: decision.reason ?? 'approved',
        reasonCode,
      };
    } catch (error) {
      const reasonCode = 'MEM-COMPACT-STM-FAILED' as MemoryMutationReasonCode;
      await this.ltmStore.appendAuditRecord({
        id: mutationId,
        action: 'compact-stm',
        actor: request.actor,
        outcome: 'failed',
        reasonCode,
        reason: normalizeErrorMessage(error),
        projectId: request.projectId,
        traceId: request.traceId,
        evidenceRefs: request.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: normalizeErrorMessage(error),
        reasonCode,
      };
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
      metadata as Record<string, unknown>,
    );

    return {
      ...entry,
      embedding: embedded.vector,
    };
  }

  private async rollbackVectorIndex(id: MemoryEntryId): Promise<void> {
    if (!this.vectorIndexing) {
      return;
    }

    try {
      await this.vectorIndexing.vectorStore.delete(
        this.vectorIndexing.collection,
        id,
      );
    } catch {
      // Best-effort compensation. Primary error is surfaced to caller.
    }
  }

  private makeMemoryEntryId(): MemoryEntryId {
    return this.idFactory() as MemoryEntryId;
  }

  private makeMutationId(): MemoryMutationId {
    return this.idFactory() as MemoryMutationId;
  }
}

function buildVectorRuntime(
  options: MwcVectorIndexingOptions | undefined,
  idFactory: () => string,
  now: () => string,
): MwcVectorIndexingRuntime | undefined {
  if (!options) {
    return undefined;
  }

  return {
    vectorStore: options.vectorStore,
    collection: options.collection ?? DEFAULT_VECTOR_COLLECTION,
    pipeline: new DeterministicEmbeddingPipeline({
      embedder: options.embedder as IEmbedder,
      profile: options.profile as EmbeddingModelProvenance,
      idFactory,
      now,
    }),
    buildEvidenceRefs:
      options.buildEvidenceRefs != null
        ? (entry) => options.buildEvidenceRefs!(entry)
        : () => [{ actionCategory: 'memory-write' }],
  };
}

function parseCandidate(candidate: MemoryWriteCandidate): MemoryWriteCandidate {
  const parseResult = MemoryWriteCandidateSchema.safeParse(candidate);
  if (!parseResult.success) {
    const errors = parseResult.error.errors.map((error) => ({
      path: error.path.join('.'),
      message: error.message,
    }));
    throw new ValidationError('Invalid MemoryWriteCandidate', errors);
  }

  if (parseResult.data.type === 'experience-record') {
    const experience = ExperienceRecordWriteCandidateSchema.safeParse(
      parseResult.data,
    );
    if (!experience.success) {
      const errors = experience.error.errors.map((error) => ({
        path: error.path.join('.'),
        message: error.message,
      }));
      throw new ValidationError(
        'Invalid ExperienceRecordWriteCandidate: experience-record requires sentiment, context, action, outcome, reason',
        errors,
      );
    }
  }

  return parseResult.data;
}

function isTypedCandidate(candidate: MemoryWriteCandidate): boolean {
  return candidate.type === 'fact' || candidate.type === 'preference';
}

function candidateToEntry(input: {
  candidate: MemoryWriteCandidate;
  projectId?: ProjectId;
  now: string;
  mutationId: MemoryMutationId;
  id: MemoryEntryId;
}): MemoryEntry {
  const { candidate, projectId, now, mutationId, id } = input;
  const placementState =
    candidate.scope === 'global' ? 'global-probation' : 'project';

  const base: MemoryEntry = {
    id,
    content: candidate.content,
    type: candidate.type,
    scope: candidate.scope,
    projectId,
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

  if (candidate.type === 'experience-record') {
    return {
      ...base,
      context: candidate.context,
      action: candidate.action,
      outcome: candidate.outcome,
      reason: candidate.reason,
    };
  }

  return base;
}

function resolveEntryProjectId(
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
): ProjectId | undefined {
  if (candidate.scope === 'global') {
    return undefined;
  }
  return projectId ?? candidate.projectId;
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

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
