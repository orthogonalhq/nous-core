/**
 * ModelPricingRegistry — In-memory pricing table for model cost lookups.
 *
 * Maps (providerId, modelId) pairs to per-million-token pricing. Used by
 * CostGovernanceService for real-time cost calculation on inference events.
 */
import type { ModelPricingEntry } from '@nous/shared';

export class ModelPricingRegistry {
  /** Keyed by `${providerId}:${modelId}` */
  private entries = new Map<string, ModelPricingEntry>();

  private static key(providerId: string, modelId: string): string {
    return `${providerId}:${modelId}`;
  }

  /** Look up pricing for a provider/model pair. Returns null if not found. */
  getPrice(
    providerId: string,
    modelId: string,
  ): { inputPricePerMillionTokens: number; outputPricePerMillionTokens: number } | null {
    const entry = this.entries.get(ModelPricingRegistry.key(providerId, modelId));
    if (!entry) return null;
    return {
      inputPricePerMillionTokens: entry.inputPricePerMillionTokens,
      outputPricePerMillionTokens: entry.outputPricePerMillionTokens,
    };
  }

  /** Set or update a pricing entry. */
  setEntry(entry: ModelPricingEntry): void {
    this.entries.set(
      ModelPricingRegistry.key(entry.providerId, entry.modelId),
      entry,
    );
  }

  /** Remove a pricing entry. Returns true if the entry existed. */
  removeEntry(providerId: string, modelId: string): boolean {
    return this.entries.delete(ModelPricingRegistry.key(providerId, modelId));
  }

  /** Get all pricing entries. */
  getAll(): ModelPricingEntry[] {
    return [...this.entries.values()];
  }
}
