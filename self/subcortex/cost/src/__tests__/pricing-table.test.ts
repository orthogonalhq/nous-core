import { describe, it, expect } from 'vitest';
import {
  createPricingTable,
  lookupPricingTier,
  computeCost,
} from '../pricing-table.js';
import type { PricingTier } from '@nous/shared';

describe('createPricingTable', () => {
  it('returns a Map with entries for known Anthropic models', () => {
    const table = createPricingTable();

    expect(table.get('anthropic:claude-sonnet-4-20250514')).toBeDefined();
    expect(table.get('anthropic:claude-haiku-3-20240307')).toBeDefined();
    expect(table.get('anthropic:claude-opus-4-20250514')).toBeDefined();
  });

  it('returns entries for known OpenAI models', () => {
    const table = createPricingTable();

    expect(table.get('openai:gpt-4o')).toBeDefined();
    expect(table.get('openai:gpt-4o-mini')).toBeDefined();
    expect(table.get('openai:gpt-4-turbo')).toBeDefined();
  });

  it('returns entries for known Ollama models with zero cost', () => {
    const table = createPricingTable();

    const llama = table.get('ollama:llama3');
    expect(llama).toBeDefined();
    expect(llama!.inputCostPerMillionTokens).toBe(0);
    expect(llama!.outputCostPerMillionTokens).toBe(0);

    const mistral = table.get('ollama:mistral');
    expect(mistral).toBeDefined();
    expect(mistral!.inputCostPerMillionTokens).toBe(0);
    expect(mistral!.outputCostPerMillionTokens).toBe(0);

    const codellama = table.get('ollama:codellama');
    expect(codellama).toBeDefined();
    expect(codellama!.inputCostPerMillionTokens).toBe(0);
    expect(codellama!.outputCostPerMillionTokens).toBe(0);
  });

  it('applies custom overrides that replace default entries', () => {
    const overrides: PricingTier[] = [
      {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        inputCostPerMillionTokens: 5.0,
        outputCostPerMillionTokens: 20.0,
      },
    ];

    const table = createPricingTable(overrides);
    const tier = table.get('anthropic:claude-sonnet-4-20250514');

    expect(tier).toBeDefined();
    expect(tier!.inputCostPerMillionTokens).toBe(5.0);
    expect(tier!.outputCostPerMillionTokens).toBe(20.0);
  });

  it('applies custom overrides that add new entries', () => {
    const overrides: PricingTier[] = [
      {
        providerId: 'custom',
        modelId: 'my-model',
        inputCostPerMillionTokens: 1.0,
        outputCostPerMillionTokens: 2.0,
      },
    ];

    const table = createPricingTable(overrides);
    const tier = table.get('custom:my-model');

    expect(tier).toBeDefined();
    expect(tier!.inputCostPerMillionTokens).toBe(1.0);
    expect(tier!.outputCostPerMillionTokens).toBe(2.0);
  });

  it('returns independent Map instances on each call', () => {
    const table1 = createPricingTable();
    const table2 = createPricingTable();

    expect(table1).not.toBe(table2);

    // Mutating one does not affect the other
    table1.delete('anthropic:claude-sonnet-4-20250514');
    expect(table2.get('anthropic:claude-sonnet-4-20250514')).toBeDefined();
  });
});

describe('lookupPricingTier', () => {
  it('returns the correct PricingTier for a known provider:model', () => {
    const table = createPricingTable();
    const tier = lookupPricingTier(table, 'anthropic', 'claude-sonnet-4-20250514');

    expect(tier).toBeDefined();
    expect(tier!.providerId).toBe('anthropic');
    expect(tier!.modelId).toBe('claude-sonnet-4-20250514');
    expect(tier!.inputCostPerMillionTokens).toBe(3.0);
    expect(tier!.outputCostPerMillionTokens).toBe(15.0);
  });

  it('returns undefined for an unknown provider:model', () => {
    const table = createPricingTable();
    const tier = lookupPricingTier(table, 'unknown', 'unknown');

    expect(tier).toBeUndefined();
  });
});

describe('computeCost', () => {
  const sonnetTier: PricingTier = {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    inputCostPerMillionTokens: 3.0,
    outputCostPerMillionTokens: 15.0,
  };

  const ollamaTier: PricingTier = {
    providerId: 'ollama',
    modelId: 'llama3',
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  };

  it('returns correct shape with inputCostUsd, outputCostUsd, totalCostUsd', () => {
    const result = computeCost(1_000, 1_000, sonnetTier);

    expect(result).toHaveProperty('inputCostUsd');
    expect(result).toHaveProperty('outputCostUsd');
    expect(result).toHaveProperty('totalCostUsd');
    expect(typeof result.inputCostUsd).toBe('number');
    expect(typeof result.outputCostUsd).toBe('number');
    expect(typeof result.totalCostUsd).toBe('number');
  });

  it('computes correct dollar amounts for 1M input and 1M output tokens (Anthropic Sonnet)', () => {
    const result = computeCost(1_000_000, 1_000_000, sonnetTier);

    expect(result.inputCostUsd).toBe(3.0);
    expect(result.outputCostUsd).toBe(15.0);
    expect(result.totalCostUsd).toBe(18.0);
  });

  it('computes correct dollar amounts for mixed token counts', () => {
    // 1M input, 500K output
    const result = computeCost(1_000_000, 500_000, sonnetTier);

    expect(result.inputCostUsd).toBe(3.0);
    expect(result.outputCostUsd).toBe(7.5);
    expect(result.totalCostUsd).toBe(10.5);
  });

  it('returns all zeros for Ollama (zero-cost local inference)', () => {
    const result = computeCost(1_000_000, 1_000_000, ollamaTier);

    expect(result.inputCostUsd).toBe(0);
    expect(result.outputCostUsd).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it('returns all zeros when input and output tokens are 0', () => {
    const result = computeCost(0, 0, sonnetTier);

    expect(result.inputCostUsd).toBe(0);
    expect(result.outputCostUsd).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it('produces non-NaN, non-negative values for very large token counts', () => {
    const result = computeCost(1_000_000_000, 1_000_000_000, sonnetTier);

    expect(Number.isNaN(result.inputCostUsd)).toBe(false);
    expect(Number.isNaN(result.outputCostUsd)).toBe(false);
    expect(Number.isNaN(result.totalCostUsd)).toBe(false);
    expect(result.inputCostUsd).toBeGreaterThanOrEqual(0);
    expect(result.outputCostUsd).toBeGreaterThanOrEqual(0);
    expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);

    // Verify expected values: 1B tokens at $3/M = $3000, 1B tokens at $15/M = $15000
    expect(result.inputCostUsd).toBe(3000);
    expect(result.outputCostUsd).toBe(15000);
    expect(result.totalCostUsd).toBe(18000);
  });
});
