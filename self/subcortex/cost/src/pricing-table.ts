/**
 * Configurable pricing lookup for inference cost computation.
 *
 * Pure functions — no shared mutable state, no side effects.
 * Default rates are approximate as of 2026-04 and are configurable
 * via the `overrides` parameter to `createPricingTable()`.
 *
 * Key format: `${providerId}:${modelId}` (colon-separated).
 * Providers must not contain `:` in their IDs.
 */
import type { PricingTier, PricingTable } from '@nous/shared';

/** Default pricing tiers for known providers. */
const DEFAULT_TIERS: PricingTier[] = [
  // --- Anthropic ---
  {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    inputCostPerMillionTokens: 3.0,
    outputCostPerMillionTokens: 15.0,
  },
  {
    providerId: 'anthropic',
    modelId: 'claude-haiku-3-20240307',
    inputCostPerMillionTokens: 0.25,
    outputCostPerMillionTokens: 1.25,
  },
  {
    providerId: 'anthropic',
    modelId: 'claude-opus-4-20250514',
    inputCostPerMillionTokens: 15.0,
    outputCostPerMillionTokens: 75.0,
  },

  // --- OpenAI ---
  {
    providerId: 'openai',
    modelId: 'gpt-4o',
    inputCostPerMillionTokens: 2.5,
    outputCostPerMillionTokens: 10.0,
  },
  {
    providerId: 'openai',
    modelId: 'gpt-4o-mini',
    inputCostPerMillionTokens: 0.15,
    outputCostPerMillionTokens: 0.6,
  },
  {
    providerId: 'openai',
    modelId: 'gpt-4-turbo',
    inputCostPerMillionTokens: 10.0,
    outputCostPerMillionTokens: 30.0,
  },

  // --- Ollama (local inference — zero cost) ---
  {
    providerId: 'ollama',
    modelId: 'llama3',
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    providerId: 'ollama',
    modelId: 'mistral',
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    providerId: 'ollama',
    modelId: 'codellama',
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
];

/**
 * Build the `providerId:modelId` key for the pricing table Map.
 */
function tierKey(providerId: string, modelId: string): `${string}:${string}` {
  return `${providerId}:${modelId}`;
}

/**
 * Create a new PricingTable populated with default rates for known
 * Anthropic, OpenAI, and Ollama models.
 *
 * @param overrides - Optional array of PricingTier entries. Each override
 *   replaces the default entry for a matching `providerId:modelId` key,
 *   or adds a new entry if the key did not exist in defaults.
 * @returns A new PricingTable Map instance.
 */
export function createPricingTable(overrides?: PricingTier[]): PricingTable {
  const table: PricingTable = new Map();

  for (const tier of DEFAULT_TIERS) {
    table.set(tierKey(tier.providerId, tier.modelId), tier);
  }

  if (overrides) {
    for (const tier of overrides) {
      table.set(tierKey(tier.providerId, tier.modelId), tier);
    }
  }

  return table;
}

/**
 * Look up a pricing tier by provider and model.
 *
 * @returns The PricingTier for the given provider:model, or `undefined`
 *   if the combination is not in the table.
 */
export function lookupPricingTier(
  table: PricingTable,
  providerId: string,
  modelId: string,
): PricingTier | undefined {
  return table.get(tierKey(providerId, modelId));
}

/**
 * Compute the dollar cost for a given token count and pricing tier.
 *
 * Formula: `(tokens / 1_000_000) * costPerMillionTokens`
 *
 * @returns An object with `inputCostUsd`, `outputCostUsd`, and `totalCostUsd`.
 */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  tier: PricingTier,
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const inputCostUsd =
    (inputTokens / 1_000_000) * tier.inputCostPerMillionTokens;
  const outputCostUsd =
    (outputTokens / 1_000_000) * tier.outputCostPerMillionTokens;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  return { inputCostUsd, outputCostUsd, totalCostUsd };
}
