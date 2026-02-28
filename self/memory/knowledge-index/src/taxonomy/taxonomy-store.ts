/**
 * In-memory taxonomy store — tags and metadata.
 *
 * Phase 6.2: Additive tags only. Zero inference cost.
 */
import type { TaxonomyTagMetadata } from '@nous/shared';
import { TaxonomyTagSchema } from '@nous/shared';

export interface ITaxonomyStore {
  listTags(): Promise<string[]>;
  addTag(tag: string, metadata?: TaxonomyTagMetadata): Promise<void>;
  getTagMetadata(tag: string): Promise<TaxonomyTagMetadata | null>;
}

export class InMemoryTaxonomyStore implements ITaxonomyStore {
  private readonly tagMetadata = new Map<string, TaxonomyTagMetadata>();

  async listTags(): Promise<string[]> {
    return Array.from(this.tagMetadata.keys()).sort();
  }

  async addTag(tag: string, metadata?: TaxonomyTagMetadata): Promise<void> {
    const parsed = TaxonomyTagSchema.parse(tag);
    const meta = metadata ?? { addedAt: new Date().toISOString() };
    this.tagMetadata.set(parsed, meta);
  }

  async getTagMetadata(tag: string): Promise<TaxonomyTagMetadata | null> {
    return this.tagMetadata.get(tag) ?? null;
  }
}
