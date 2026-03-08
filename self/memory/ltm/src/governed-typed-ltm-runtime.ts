import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DeterministicEmbeddingPipeline } from '@nous/autonomic-embeddings';
import {
  buildPolicyAccessContextForMemoryWrite,
  isCrossProjectMemoryWrite,
} from '@nous/memory-access';
import type {
  EmbeddingModelProvenance,
  IEmbedder,
  IMemoryAccessPolicyEngine,
  IProjectStore,
  IVectorStore,
  MemoryEntry,
  MemoryEntryId,
  MemoryMutationAction,
  MemoryMutationActor,
  MemoryMutationId,
  MemoryMutationReasonCode,
  MemoryMutationRequest,
  MemoryTombstoneId,
  MemoryWriteCandidate,
  NodeId,
  PolicyDecisionRecord,
  ProjectId,
  ProjectControlState,
  TraceEvidenceReference,
  TraceId,
} from '@nous/shared';
import {
  ExperienceRecordWriteCandidateSchema,
  MemoryEntrySchema,
  MemoryMutationRequestSchema,
  MemoryWriteCandidateSchema,
  ValidationError,
} from '@nous/shared';
import type { DocumentLtmStore } from './document-ltm-store.js';

const DEFAULT_VECTOR_COLLECTION = 'memory';

export const TypedLtmWriteCandidateSchema = MemoryWriteCandidateSchema.and(
  z.object({
    type: z.enum(['fact', 'preference']),
  }),
);

export const TypedLtmEntrySchema = MemoryEntrySchema.refine(
  (entry) => entry.type === 'fact' || entry.type === 'preference',
  { message: 'Typed LTM runtime only accepts fact or preference entries.' },
);

export type TypedLtmMemoryType = z.infer<typeof TypedLtmWriteCandidateSchema>['type'];
export type TypedLtmWriteCandidate = z.infer<typeof TypedLtmWriteCandidateSchema>;
export type TypedLtmEntry = z.infer<typeof TypedLtmEntrySchema>;

export interface GovernedTypedLtmPolicyOptions {
  policyEngine: IMemoryAccessPolicyEngine;
  projectStore: Pick<IProjectStore, 'get'>;
  getProjectControlState?: (
    projectId: ProjectId,
  ) => Promise<ProjectControlState | undefined>;
  nodeId?: NodeId;
}

export type GovernedTypedLtmMutationGuard = (
  request: MemoryMutationRequest,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string; reasonCode?: string }>;

export interface LtmVectorIndexingOptions {
  vectorStore: IVectorStore;
  embedder: IEmbedder;
  profile: EmbeddingModelProvenance;
  collection?: string;
  buildEvidenceRefs?: (
    entry: MemoryEntry,
    policyDecision?: PolicyDecisionRecord,
  ) => TraceEvidenceReference[];
}

export interface GovernedTypedLtmRuntimeOptions {
  idFactory?: () => string;
  now?: () => string;
  mutationGuard?: GovernedTypedLtmMutationGuard;
  vectorIndexing?: LtmVectorIndexingOptions;
  policy?: GovernedTypedLtmPolicyOptions;
}

export interface GovernedTypedLtmWriteDecision {
  approved: boolean;
  reason?: string;
  reasonCode?: MemoryMutationReasonCode;
  policyDecision?: PolicyDecisionRecord;
}

export interface GovernedTypedLtmWriteInput {
  candidate: TypedLtmWriteCandidate;
  projectId?: ProjectId;
  actingProjectId?: ProjectId;
  actor?: MemoryMutationActor;
  decision?: GovernedTypedLtmWriteDecision;
  traceId?: TraceId;
  evidenceRefs?: TraceEvidenceReference[];
}

export interface GovernedTypedLtmMutationResult {
  applied: boolean;
  mutationId: MemoryMutationId;
  reason: string;
  reasonCode: MemoryMutationReasonCode;
  resultingEntryId?: MemoryEntryId;
  tombstoneId?: MemoryTombstoneId;
  policyDecision?: PolicyDecisionRecord;
  indexed: boolean;
}

interface VectorIndexingRuntime {
  vectorStore: IVectorStore;
  collection: string;
  pipeline: DeterministicEmbeddingPipeline;
  buildEvidenceRefs: (
    entry: MemoryEntry,
    policyDecision?: PolicyDecisionRecord,
  ) => TraceEvidenceReference[];
}

export class GovernedTypedLtmRuntime {
  private readonly idFactory: () => string;

  private readonly now: () => string;

  private readonly mutationGuard: GovernedTypedLtmMutationGuard;

  private readonly vectorIndexing?: VectorIndexingRuntime;

  private readonly policy?: GovernedTypedLtmPolicyOptions;

  constructor(
    private readonly store: DocumentLtmStore,
    options: GovernedTypedLtmRuntimeOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.mutationGuard =
      options.mutationGuard ??
      (async () => ({
        approved: true,
        reason: 'approved',
        reasonCode: 'MEM-APPROVED',
      }));
    this.policy = options.policy;

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

  async write(
    input: GovernedTypedLtmWriteInput,
  ): Promise<GovernedTypedLtmMutationResult> {
    const parsed = TypedLtmWriteCandidateSchema.safeParse(input.candidate);
    if (!parsed.success) {
      throw toValidationError('Invalid TypedLtmWriteCandidate', parsed.error.errors);
    }

    const candidate = parsed.data;
    const mutationId = this.makeMutationId();
    const now = this.now();
    const actor = input.actor ?? 'pfc';
    const traceId = input.traceId ?? candidate.provenance.traceId;
    const projectId = resolveEntryProjectId(candidate, input.projectId);
    const policyResult = await this.evaluateWritePolicy({
      candidate,
      actingProjectId: input.actingProjectId,
      traceId,
    });

    if (policyResult && !policyResult.allowed) {
      await this.store.appendAuditRecord({
        id: mutationId,
        action: 'create',
        actor,
        outcome: 'denied',
        reasonCode: 'MEM-CREATE-DENIED',
        reason: `${policyResult.reasonCode}: ${policyResult.reason}`,
        projectId,
        traceId,
        evidenceRefs: input.evidenceRefs ?? [],
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: policyResult.reason,
        reasonCode: 'MEM-CREATE-DENIED',
        policyDecision: policyResult.decisionRecord,
        indexed: false,
      };
    }

    const decision = input.decision ?? {
      approved: true,
      reason: 'approved',
      reasonCode: 'MEM-APPROVED' as MemoryMutationReasonCode,
    };

    if (!decision.approved) {
      const reasonCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        'MEM-CREATE-DENIED',
      );
      await this.store.appendAuditRecord({
        id: mutationId,
        action: 'create',
        actor,
        outcome: 'denied',
        reasonCode,
        reason: decision.reason ?? 'denied',
        projectId,
        traceId,
        evidenceRefs: input.evidenceRefs ?? [],
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: decision.reason ?? 'denied',
        reasonCode,
        policyDecision: decision.policyDecision ?? policyResult?.decisionRecord,
        indexed: false,
      };
    }

    const entry = candidateToEntry({
      candidate,
      projectId,
      now,
      mutationId,
      id: this.makeMemoryEntryId(),
    });
    const preparedEntry = await this.prepareVectorIndexing(
      entry,
      decision.policyDecision ?? policyResult?.decisionRecord,
    );

    try {
      await this.store.write(preparedEntry);
    } catch (error) {
      await this.rollbackVectorIndex(preparedEntry.id);
      throw error;
    }

    const appliedReasonCode = normalizeReasonCode(
      decision.reasonCode ?? decision.reason,
      'MEM-CREATE-APPLIED',
    );
    await this.store.appendAuditRecord({
      id: mutationId,
      action: 'create',
      actor,
      outcome: 'applied',
      reasonCode: appliedReasonCode,
      reason: decision.reason ?? 'approved',
      projectId,
      resultingEntryId: preparedEntry.id,
      traceId,
      evidenceRefs: input.evidenceRefs ?? [],
      occurredAt: now,
    });

    return {
      applied: true,
      mutationId,
      reason: decision.reason ?? 'approved',
      reasonCode: appliedReasonCode,
      resultingEntryId: preparedEntry.id,
      policyDecision: decision.policyDecision ?? policyResult?.decisionRecord,
      indexed: this.vectorIndexing != null,
    };
  }

  async mutate(
    request: MemoryMutationRequest,
    projectId?: ProjectId,
  ): Promise<GovernedTypedLtmMutationResult> {
    const parsed = MemoryMutationRequestSchema.safeParse({
      ...request,
      projectId: request.projectId ?? projectId,
    });
    if (!parsed.success) {
      throw toValidationError('Invalid MemoryMutationRequest', parsed.error.errors);
    }

    let normalized = parsed.data;
    if (!normalized.projectId && normalized.targetEntryId) {
      const target = await this.store.read(normalized.targetEntryId);
      if (target?.projectId) {
        normalized = { ...normalized, projectId: target.projectId };
      }
    }

    const mutationId = normalized.id ?? this.makeMutationId();
    const now = normalized.requestedAt ?? this.now();
    const decision = await this.mutationGuard(
      { ...normalized, id: mutationId, requestedAt: now },
      normalized.projectId,
    );

    if (!decision.approved) {
      const reasonCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        'MEM-MUTATION-DENIED',
      );
      await this.store.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'denied',
        reasonCode,
        reason: decision.reason ?? 'denied',
        projectId: normalized.projectId,
        targetEntryId: normalized.targetEntryId,
        traceId: normalized.traceId,
        evidenceRefs: normalized.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: decision.reason ?? 'denied',
        reasonCode,
        indexed: false,
      };
    }

    try {
      const applied = await this.applyMutation({
        request: { ...normalized, id: mutationId, requestedAt: now },
        mutationId,
        now,
      });

      const appliedReasonCode = normalizeReasonCode(
        decision.reasonCode ?? decision.reason,
        defaultReasonCode(normalized.action, 'applied'),
      );
      await this.store.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'applied',
        reasonCode: appliedReasonCode,
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
        reasonCode: appliedReasonCode,
        resultingEntryId: applied.resultingEntryId,
        tombstoneId: applied.tombstoneId,
        indexed: applied.indexed,
      };
    } catch (error) {
      const failedCode = defaultReasonCode(normalized.action, 'failed');
      await this.store.appendAuditRecord({
        id: mutationId,
        action: normalized.action,
        actor: normalized.actor,
        outcome: 'failed',
        reasonCode: failedCode,
        reason: normalizeErrorMessage(error),
        projectId: normalized.projectId,
        targetEntryId: normalized.targetEntryId,
        traceId: normalized.traceId,
        evidenceRefs: normalized.evidenceRefs,
        occurredAt: now,
      });
      return {
        applied: false,
        mutationId,
        reason: normalizeErrorMessage(error),
        reasonCode: failedCode,
        indexed: false,
      };
    }
  }

  private async applyMutation(input: {
    request: MemoryMutationRequest & {
      id: MemoryMutationId;
      requestedAt: string;
    };
    mutationId: MemoryMutationId;
    now: string;
  }): Promise<{
    resultingEntryId?: MemoryEntryId;
    tombstoneId?: MemoryTombstoneId;
    indexed: boolean;
  }> {
    const { request, mutationId, now } = input;

    switch (request.action) {
      case 'create': {
        if (!request.replacementCandidate) {
          throw new Error('MEM-REPLACEMENT-CANDIDATE-REQUIRED');
        }
        const created = await this.persistCandidate(
          request.replacementCandidate,
          request.projectId,
          mutationId,
          now,
        );
        return {
          resultingEntryId: created.id,
          indexed: this.vectorIndexing != null,
        };
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

        const replacement = await this.persistCandidate(
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

        await this.store.write({
          ...previous,
          lifecycleStatus: 'superseded',
          supersededBy: replacement.id,
          updatedAt: now,
          lastMutationId: mutationId,
        });

        return {
          resultingEntryId: replacement.id,
          indexed: this.vectorIndexing != null,
        };
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
          await this.store.createTombstone({
            id: tombstoneId,
            targetEntryId: existing.id,
            targetContentHash: sha256(existing.content),
            deletedByMutationId: mutationId,
            projectId: existing.projectId,
            reason: request.reason,
            createdAt: now,
          });
        }

        await this.store.write({
          ...existing,
          lifecycleStatus:
            request.action === 'hard-delete' ? 'hard-deleted' : 'soft-deleted',
          deletedAt: now,
          tombstoneId,
          content:
            request.action === 'hard-delete' ? '[hard-deleted]' : existing.content,
          updatedAt: now,
          lastMutationId: mutationId,
        });

        return {
          resultingEntryId: existing.id,
          tombstoneId,
          indexed: false,
        };
      }
      case 'promote-global':
      case 'demote-project': {
        if (!request.targetEntryId) {
          throw new Error('MEM-TARGET-REQUIRED');
        }

        const existing = await this.readEntryOrThrow(request.targetEntryId);
        const promoted = request.action === 'promote-global';
        await this.store.write({
          ...existing,
          scope: promoted ? 'global' : 'project',
          projectId: promoted ? undefined : request.projectId ?? existing.projectId,
          placementState: promoted ? 'global-probation' : 'project',
          updatedAt: now,
          lastMutationId: mutationId,
        });

        return {
          resultingEntryId: existing.id,
          indexed: false,
        };
      }
      default:
        throw new Error('MEM-ACTION-NOT-SUPPORTED');
    }
  }

  private async persistCandidate(
    candidate: MemoryWriteCandidate,
    projectId: ProjectId | undefined,
    mutationId: MemoryMutationId,
    now: string,
  ): Promise<MemoryEntry> {
    const validated = parseSupportedCandidate(candidate);
    const entry = candidateToEntry({
      candidate: validated,
      projectId: resolveEntryProjectId(validated, projectId),
      now,
      mutationId,
      id: this.makeMemoryEntryId(),
    });
    const preparedEntry = await this.prepareVectorIndexing(entry);

    try {
      await this.store.write(preparedEntry);
    } catch (error) {
      await this.rollbackVectorIndex(preparedEntry.id);
      throw error;
    }

    return preparedEntry;
  }

  private async prepareVectorIndexing(
    entry: MemoryEntry,
    policyDecision?: PolicyDecisionRecord,
  ): Promise<MemoryEntry> {
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
      evidenceRefs: this.vectorIndexing.buildEvidenceRefs(entry, policyDecision),
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

  private async evaluateWritePolicy(input: {
    candidate: TypedLtmWriteCandidate;
    actingProjectId?: ProjectId;
    traceId?: TraceId;
  }): Promise<
    | {
        allowed: boolean;
        reasonCode: string;
        reason: string;
        decisionRecord: PolicyDecisionRecord;
      }
    | undefined
  > {
    if (
      !input.actingProjectId ||
      !isCrossProjectMemoryWrite(input.candidate, input.actingProjectId)
    ) {
      return undefined;
    }

    if (!this.policy) {
      return undefined;
    }

    const actingConfig = await this.policy.projectStore.get(input.actingProjectId);
    const targetConfig =
      input.candidate.projectId &&
      input.candidate.projectId !== input.actingProjectId
        ? await this.policy.projectStore.get(input.candidate.projectId)
        : null;
    const projectControlState = this.policy.getProjectControlState
      ? await this.policy.getProjectControlState(input.actingProjectId)
      : undefined;

    const policyCtx = buildPolicyAccessContextForMemoryWrite({
      candidate: input.candidate,
      actingProjectId: input.actingProjectId,
      actingProjectConfig: actingConfig,
      targetProjectConfig: targetConfig,
      projectControlState,
      traceId: input.traceId,
      nodeId: this.policy.nodeId,
    });

    if (!policyCtx) {
      return deniedPolicyResult({
        projectId: input.actingProjectId,
        targetProjectId:
          input.candidate.scope === 'global' ? undefined : input.candidate.projectId,
        nodeId: this.policy.nodeId,
        traceId: input.traceId,
        idFactory: this.idFactory,
        now: this.now,
        reason: 'Policy config unavailable; deny-by-default',
      });
    }

    return this.policy.policyEngine.evaluate(policyCtx);
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

  private async readEntryOrThrow(id: MemoryEntryId): Promise<MemoryEntry> {
    const entry = await this.store.read(id);
    if (!entry) {
      throw new Error('MEM-TARGET-NOT-FOUND');
    }
    return entry;
  }
}

function parseSupportedCandidate(candidate: MemoryWriteCandidate): MemoryWriteCandidate {
  const parsed = MemoryWriteCandidateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw toValidationError('Invalid MemoryWriteCandidate', parsed.error.errors);
  }

  if (parsed.data.type === 'experience-record') {
    const experience = ExperienceRecordWriteCandidateSchema.safeParse(parsed.data);
    if (!experience.success) {
      throw toValidationError(
        'Invalid ExperienceRecordWriteCandidate',
        experience.error.errors,
      );
    }
  }

  return parsed.data;
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

function deniedPolicyResult(input: {
  projectId: ProjectId;
  targetProjectId?: ProjectId;
  nodeId?: NodeId;
  traceId?: TraceId;
  idFactory: () => string;
  now: () => string;
  reason: string;
}): {
  allowed: false;
  reasonCode: 'POL-DENIED';
  reason: string;
  decisionRecord: PolicyDecisionRecord;
} {
  return {
    allowed: false,
    reasonCode: 'POL-DENIED',
    reason: input.reason,
    decisionRecord: {
      id: input.idFactory(),
      projectId: input.projectId,
      targetProjectId: input.targetProjectId,
      action: 'write',
      outcome: 'denied',
      reasonCode: 'POL-DENIED',
      reason: input.reason,
      nodeId: input.nodeId,
      traceId: input.traceId,
      evidenceRefs: [],
      occurredAt: input.now(),
    },
  };
}

function toValidationError(
  message: string,
  errors: Array<{ path: (string | number)[]; message: string }>,
): ValidationError {
  return new ValidationError(
    message,
    errors.map((error) => ({
      path: error.path.join('.'),
      message: error.message,
    })),
  );
}
