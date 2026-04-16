/**
 * DocumentStmStore — IStmStore implementation using IDocumentStore.
 *
 * STM stored as single document per project. Collection: stm_context.
 * Document ID: ProjectId.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { IDocumentStore, ILogChannel, IStmStore } from '@nous/shared';
import {
  DEFAULT_STM_COMPACTION_POLICY,
  StmContextSchema,
  StmCompactionPolicySchema,
  StmCompactionSummarySchema,
  StmEntrySchema,
  ValidationError,
  type ProjectId,
  type StmCompactionPolicy,
  type StmCompactionTrigger,
  type StmContext,
  type StmEntry,
} from '@nous/shared';

const COLLECTION = 'stm_context';
const COMPACTION_COLLECTION = 'stm_compaction_summaries';

function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

export interface DocumentStmStoreOptions {
  compactionPolicy?: Partial<StmCompactionPolicy>;
  log?: ILogChannel;
}

export class DocumentStmStore implements IStmStore {
  private readonly compactionPolicy: StmCompactionPolicy;
  private readonly log: ILogChannel;

  constructor(
    private readonly documentStore: IDocumentStore,
    options: DocumentStmStoreOptions = {},
  ) {
    this.compactionPolicy = StmCompactionPolicySchema.parse({
      ...DEFAULT_STM_COMPACTION_POLICY,
      ...options.compactionPolicy,
    });
    this.log = options.log ?? { debug() {}, info() {}, warn() {}, error() {}, isEnabled() { return false; } };
  }

  async getContext(projectId: ProjectId): Promise<StmContext> {
    const raw = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      projectId,
    );
    if (!raw) {
      return buildContext(
        { entries: [], summary: undefined },
        this.compactionPolicy,
      );
    }

    const result = StmContextSchema.safeParse(raw);
    if (!result.success) {
      return buildContext(
        { entries: [], summary: undefined },
        this.compactionPolicy,
      );
    }

    const context = buildContext(result.data, this.compactionPolicy);
    this.log.debug(
      `get_context projectId=${projectId} entries=${context.entries.length} tokens=${context.tokenCount}`,
    );
    return context;
  }

  async append(projectId: ProjectId, entry: StmEntry): Promise<void> {
    const result = StmEntrySchema.safeParse(entry);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid STM entry', errors);
    }
    const validated = result.data;

    const context = await this.getContext(projectId);
    const updated = buildContext(
      {
        entries: [...context.entries, validated],
        summary: context.summary,
      },
      this.compactionPolicy,
    );

    await this.documentStore.put(COLLECTION, projectId, updated);
    this.log.debug(
      `append projectId=${projectId} role=${validated.role} length=${validated.content.length} tokens=${updated.tokenCount}`,
    );
  }

  async compact(projectId: ProjectId): Promise<void> {
    const context = await this.getContext(projectId);
    if (context.entries.length < this.compactionPolicy.minEntriesBeforeCompaction) {
      return;
    }

    const retainedEntries = context.entries.slice(
      -this.compactionPolicy.retainedRecentEntries,
    );
    const compactedEntries = context.entries.slice(
      0,
      Math.max(
        context.entries.length - this.compactionPolicy.retainedRecentEntries,
        0,
      ),
    );
    if (compactedEntries.length === 0) {
      return;
    }

    const retainedTokens = sumEntryTokens(retainedEntries);
    const summaryBudgetTokens = Math.max(
      this.compactionPolicy.targetContextTokens - retainedTokens,
      0,
    );
    const rawSummaryText = compactedEntries
      .map((entry) => `${entry.role}: ${entry.content}`)
      .join('\n');
    const storedSummary = trimSummaryToBudget(
      rawSummaryText,
      summaryBudgetTokens,
    );
    const mergedSummary = trimSummaryToBudget(
      mergeSummaries(context.summary, rawSummaryText),
      summaryBudgetTokens,
    );
    const updated = buildContext(
      {
        entries: retainedEntries,
        summary: mergedSummary,
      },
      this.compactionPolicy,
    );
    const trigger: StmCompactionTrigger = context.compactionState?.requiresCompaction
      ? 'token-threshold'
      : 'manual';

    const generatedAt = new Date().toISOString();
    const summaryRecord = StmCompactionSummarySchema.parse({
      id: randomUUID(),
      projectId,
      summary: storedSummary ?? '',
      sourceEntryRefs: compactedEntries.map((entry) => ({
        timestamp: entry.timestamp,
        role: entry.role,
        contentHash: createHash('sha256').update(entry.content).digest('hex'),
      })),
      sourceEntryCount: compactedEntries.length,
      trigger,
      preCompactionTokenCount: context.tokenCount,
      postCompactionTokenCount: updated.tokenCount,
      retainedEntryCount: retainedEntries.length,
      generatedAt,
    });

    await this.documentStore.put(
      COMPACTION_COLLECTION,
      summaryRecord.id,
      summaryRecord,
    );

    await this.documentStore.put(COLLECTION, projectId, updated);
    this.log.info(
      `compact projectId=${projectId} trigger=${trigger} compacted=${compactedEntries.length} retained=${retainedEntries.length} preTokens=${context.tokenCount} postTokens=${updated.tokenCount}`,
    );
  }

  async clear(projectId: ProjectId): Promise<void> {
    await this.documentStore.delete(COLLECTION, projectId);
    this.log.info(`clear projectId=${projectId}`);
  }
}

function buildContext(
  input: Pick<StmContext, 'entries' | 'summary'>,
  compactionPolicy: StmCompactionPolicy,
): StmContext {
  const summary = normalizeSummary(input.summary);
  const tokenCount = calculateContextTokenCount(input.entries, summary);
  const requiresCompaction =
    tokenCount > compactionPolicy.maxContextTokens &&
    input.entries.length >= compactionPolicy.minEntriesBeforeCompaction;

  return {
    entries: input.entries,
    summary,
    tokenCount,
    compactionState: {
      requiresCompaction,
      trigger: requiresCompaction ? 'token-threshold' : 'none',
      currentTokenCount: tokenCount,
      maxContextTokens: compactionPolicy.maxContextTokens,
      targetContextTokens: compactionPolicy.targetContextTokens,
    },
  };
}

function calculateContextTokenCount(
  entries: StmEntry[],
  summary?: string,
): number {
  return estimateTokenCount(summary ?? '') + sumEntryTokens(entries);
}

function sumEntryTokens(entries: StmEntry[]): number {
  return entries.reduce(
    (total, entry) => total + estimateTokenCount(entry.content),
    0,
  );
}

function mergeSummaries(
  existingSummary: string | undefined,
  nextSummary: string,
): string {
  if (!existingSummary) {
    return nextSummary;
  }
  if (!nextSummary) {
    return existingSummary;
  }
  return `${existingSummary}\n\n${nextSummary}`;
}

function trimSummaryToBudget(
  summary: string,
  tokenBudget: number,
): string | undefined {
  if (!summary || tokenBudget <= 0) {
    return undefined;
  }

  const maxChars = tokenBudget * 4;
  if (summary.length <= maxChars) {
    return summary;
  }

  return summary.slice(summary.length - maxChars);
}

function normalizeSummary(summary: string | undefined): string | undefined {
  if (!summary) {
    return undefined;
  }
  return summary.length > 0 ? summary : undefined;
}
