import { describe, it, expect } from 'vitest';
import { ModelPricingRegistry } from '../model-pricing-registry.js';
import type { ModelPricingEntry } from '@nous/shared';

function createEntry(overrides?: Partial<ModelPricingEntry>): ModelPricingEntry {
  return {
    providerId: 'anthropic',
    modelId: 'claude-3-opus',
    inputPricePerMillionTokens: 15,
    outputPricePerMillionTokens: 75,
    effectiveAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ModelPricingRegistry', () => {
  describe('setEntry() and getPrice()', () => {
    it('returns pricing after entry is set', () => {
      const registry = new ModelPricingRegistry();
      registry.setEntry(createEntry());

      const price = registry.getPrice('anthropic', 'claude-3-opus');
      expect(price).toEqual({
        inputPricePerMillionTokens: 15,
        outputPricePerMillionTokens: 75,
      });
    });

    it('overwrites existing entry for same provider/model', () => {
      const registry = new ModelPricingRegistry();
      registry.setEntry(createEntry({ inputPricePerMillionTokens: 10 }));
      registry.setEntry(createEntry({ inputPricePerMillionTokens: 20 }));

      const price = registry.getPrice('anthropic', 'claude-3-opus');
      expect(price?.inputPricePerMillionTokens).toBe(20);
    });
  });

  describe('getPrice()', () => {
    it('returns null for unknown provider/model', () => {
      const registry = new ModelPricingRegistry();
      expect(registry.getPrice('unknown', 'model')).toBeNull();
    });
  });

  describe('removeEntry()', () => {
    it('removes an existing entry and returns true', () => {
      const registry = new ModelPricingRegistry();
      registry.setEntry(createEntry());

      const removed = registry.removeEntry('anthropic', 'claude-3-opus');
      expect(removed).toBe(true);
      expect(registry.getPrice('anthropic', 'claude-3-opus')).toBeNull();
    });

    it('returns false for non-existent entry', () => {
      const registry = new ModelPricingRegistry();
      expect(registry.removeEntry('unknown', 'model')).toBe(false);
    });
  });

  describe('getAll()', () => {
    it('returns all entries', () => {
      const registry = new ModelPricingRegistry();
      registry.setEntry(createEntry({ providerId: 'a', modelId: 'm1' }));
      registry.setEntry(createEntry({ providerId: 'b', modelId: 'm2' }));

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((e) => e.providerId).sort()).toEqual(['a', 'b']);
    });

    it('returns empty array when no entries exist', () => {
      const registry = new ModelPricingRegistry();
      expect(registry.getAll()).toEqual([]);
    });
  });
});
