import type {
  ExternalSourceMemoryEntry,
  IDocumentStore,
  IEmbedder,
  IVectorStore,
  PublicMcpMemoryTier,
  PublicMcpNamespaceRecord,
  PublicMcpSearchArguments,
} from '@nous/shared';
import {
  ExternalSourceMemoryEntrySchema,
  type ExternalSourceSearchResult,
  ExternalSourceSearchResultItemSchema,
} from '@nous/shared';

function collectionForTier(
  record: Pick<PublicMcpNamespaceRecord, 'stmCollection' | 'ltmCollection'>,
  tier: PublicMcpMemoryTier,
): string {
  return tier === 'stm' ? record.stmCollection : record.ltmCollection;
}

function matchesSearchFilters(
  entry: ExternalSourceMemoryEntry,
  input: {
    includeDeleted?: boolean;
    tags?: string[];
    after?: string;
    before?: string;
  },
): boolean {
  if (entry.lifecycleStatus === 'superseded') {
    return false;
  }
  if (!input.includeDeleted && entry.lifecycleStatus === 'soft-deleted') {
    return false;
  }
  if (input.tags && input.tags.length > 0) {
    const tags = new Set(entry.tags);
    if (!input.tags.every((tag) => tags.has(tag))) {
      return false;
    }
  }
  if (input.after && entry.updatedAt < input.after) {
    return false;
  }
  if (input.before && entry.updatedAt > input.before) {
    return false;
  }
  return true;
}

function sortSearchResults(
  left: { entry: ExternalSourceMemoryEntry; score: number },
  right: { entry: ExternalSourceMemoryEntry; score: number },
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.entry.updatedAt !== left.entry.updatedAt) {
    return right.entry.updatedAt.localeCompare(left.entry.updatedAt);
  }
  return left.entry.id.localeCompare(right.entry.id);
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

function lexicalScore(entry: ExternalSourceMemoryEntry, query: string): number {
  const tokens = tokenize(entry.content);
  const queryTokens = Array.from(tokenize(query));
  if (queryTokens.length === 0) {
    return 0;
  }
  let matches = 0;
  for (const token of queryTokens) {
    if (tokens.has(token)) {
      matches += 1;
    }
  }
  return matches / queryTokens.length;
}

export interface ExternalSourceStorageAdapterOptions {
  vectorStore?: IVectorStore;
  embedder?: IEmbedder;
}

export class ExternalSourceStorageAdapter {
  constructor(
    private readonly documentStore: IDocumentStore,
    private readonly options: ExternalSourceStorageAdapterOptions = {},
  ) {}

  async putEntry(
    record: PublicMcpNamespaceRecord,
    entry: ExternalSourceMemoryEntry,
  ): Promise<void> {
    const parsed = ExternalSourceMemoryEntrySchema.parse(entry);
    await this.documentStore.put(
      collectionForTier(record, parsed.tier),
      parsed.id,
      parsed,
    );

    if (this.options.vectorStore && this.options.embedder) {
      const vector = await this.options.embedder.embed(parsed.content);
      await this.options.vectorStore.upsert(record.vectorCollection, parsed.id, vector, {
        tier: parsed.tier,
        updatedAt: parsed.updatedAt,
      });
    }
  }

  async getEntry(
    record: PublicMcpNamespaceRecord,
    tier: PublicMcpMemoryTier,
    entryId: string,
  ): Promise<ExternalSourceMemoryEntry | null> {
    const raw = await this.documentStore.get<unknown>(
      collectionForTier(record, tier),
      entryId,
    );
    return raw ? ExternalSourceMemoryEntrySchema.parse(raw) : null;
  }

  async queryEntries(
    record: PublicMcpNamespaceRecord,
    tier: PublicMcpMemoryTier | 'both',
  ): Promise<ExternalSourceMemoryEntry[]> {
    const collections =
      tier === 'both'
        ? [record.stmCollection, record.ltmCollection]
        : [collectionForTier(record, tier)];
    const rows: ExternalSourceMemoryEntry[] = [];
    for (const collection of collections) {
      const collectionRows = await this.documentStore.query<unknown>(collection, {});
      rows.push(
        ...collectionRows.map((row) => ExternalSourceMemoryEntrySchema.parse(row)),
      );
    }
    return rows;
  }

  async searchEntries(
    record: PublicMcpNamespaceRecord,
    args: PublicMcpSearchArguments,
  ): Promise<ExternalSourceSearchResult> {
    const candidates = await this.queryEntries(record, args.tier);
    const filtered = candidates.filter((entry) => matchesSearchFilters(entry, args));

    let scored: Array<{ entry: ExternalSourceMemoryEntry; score: number }> = [];
    if (this.options.vectorStore && this.options.embedder) {
      const queryVector = await this.options.embedder.embed(args.query);
      const tiers =
        args.tier === 'both' ? (['stm', 'ltm'] as const) : ([args.tier] as const);
      const vectorResults = await Promise.all(
        tiers.map((tier) =>
          this.options.vectorStore!.search(record.vectorCollection, queryVector, args.limit, {
            where: { tier },
          }),
        ),
      );
      const scores = new Map<string, number>();
      for (const resultSet of vectorResults) {
        for (const result of resultSet) {
          const current = scores.get(result.id) ?? 0;
          if (result.score > current) {
            scores.set(result.id, result.score);
          }
        }
      }
      scored = filtered.map((entry) => ({
        entry,
        score: scores.get(entry.id) ?? lexicalScore(entry, args.query),
      }));
    } else {
      scored = filtered.map((entry) => ({
        entry,
        score: lexicalScore(entry, args.query),
      }));
    }

    return {
      entries: scored
        .sort(sortSearchResults)
        .slice(0, args.limit)
        .map((item) => ExternalSourceSearchResultItemSchema.parse(item)),
    };
  }

  async deleteVector(record: PublicMcpNamespaceRecord, entryId: string): Promise<void> {
    if (!this.options.vectorStore) {
      return;
    }
    await this.options.vectorStore.delete(record.vectorCollection, entryId);
  }

  async purge(record: PublicMcpNamespaceRecord): Promise<{ purgedCollections: string[] }> {
    const collections = [
      record.stmCollection,
      record.ltmCollection,
      record.mutationAuditCollection,
      record.tombstoneCollection,
    ];

    for (const collection of collections) {
      const rows = await this.documentStore.query<Record<string, unknown>>(collection, {});
      for (const row of rows) {
        const id = typeof row.id === 'string' ? row.id : undefined;
        if (id) {
          await this.documentStore.delete(collection, id);
          await this.deleteVector(record, id);
        }
      }
    }

    return { purgedCollections: collections };
  }
}
