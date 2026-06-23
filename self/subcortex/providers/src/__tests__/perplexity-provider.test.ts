import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@nous/shared';
import {
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
  resolveProviderDefinition,
} from '../provider-definitions.js';
import { resolveProviderFactory } from '../provider-factories.js';
import { deriveBuiltInProviderId } from '../provider-identity.js';
import { resolveAdapter, resolveAdapterKeyFromConfig } from '../adapter-resolver.js';
import { ChatCompletionsProvider } from '../protocols/openai-api/provider.js';
import type { ProviderDefinitionLeaf } from '../schemas/provider-definition.js';
import { providerDefinition } from '../providers/perplexity/definition.js';
import { providerFactory } from '../providers/perplexity/provider.js';
import { providerAdapter } from '../providers/perplexity/adapter.js';

const PERPLEXITY_CONFIG = {
  id: '00000000-0000-0000-0000-0000000000ff' as ProviderId,
  name: 'perplexity',
  type: 'text' as const,
  endpoint: 'https://api.perplexity.ai',
  modelId: 'sonar',
  isLocal: false,
  capabilities: ['text'],
};

describe('Perplexity provider definition', () => {
  it('declares OpenAI-compatible chat-completions metadata', () => {
    expect(providerDefinition.vendorKey).toBe('perplexity');
    expect(providerDefinition.displayName).toBe('Perplexity');
    expect(providerDefinition.protocol).toBe('chat-completions');
    expect(providerDefinition.adapterKey).toBe('chat-completions');
    expect(providerDefinition.providerType).toBe('text');
    expect(providerDefinition.providerClass).toBe('remote_text');
    expect(providerDefinition.defaultEndpoint).toBe('https://api.perplexity.ai');
    expect(providerDefinition.defaultModelId).toBe('sonar');
    expect(providerDefinition.isLocal).toBe(false);
  });

  it('declares vault-backed API-key auth with a bearer Authorization header', () => {
    expect(providerDefinition.auth).toEqual({
      envVar: 'PERPLEXITY_API_KEY',
      vaultKeyNamespace: 'perplexity',
      header: { name: 'Authorization', scheme: 'bearer' },
      required: true,
      purpose: 'api_key',
    });
  });

  it('does not declare dynamic model discovery (no public model-list endpoint)', () => {
    // The leaf is narrowed by `as const`; widen to the leaf contract so the
    // optional discovery fields are addressable and asserted absent.
    const leaf: ProviderDefinitionLeaf = providerDefinition;
    expect(leaf.modelListEndpoint).toBeUndefined();
    expect(leaf.modelListFormat).toBeUndefined();
    expect(leaf.capabilities?.modelListing).toBeUndefined();
  });

  it('does not hand-author wellKnownProviderId on the leaf', () => {
    expect('wellKnownProviderId' in providerDefinition).toBe(false);
  });
});

describe('Perplexity provider catalog hydration', () => {
  it('is present in PROVIDER_DEFINITIONS and validates against the schema', () => {
    const hydrated = resolveProviderDefinition('perplexity');
    expect(PROVIDER_DEFINITIONS).toContain(hydrated);
    expect(ProviderDefinitionSchema.parse(hydrated)).toEqual(hydrated);
  });

  it('derives a stable built-in provider id from vendorKey', () => {
    expect(resolveProviderDefinition('perplexity').wellKnownProviderId).toBe(
      deriveBuiltInProviderId('perplexity'),
    );
  });
});

describe('Perplexity provider factory', () => {
  it('is registered under the perplexity vendor key', () => {
    const factory = resolveProviderFactory('perplexity');
    expect(factory).toBeDefined();
    expect(factory!.vendorKey).toBe('perplexity');
    expect(providerFactory.vendorKey).toBe('perplexity');
  });

  it('constructs a ChatCompletionsProvider with the resolved key and endpoint', () => {
    const provider = providerFactory.create(PERPLEXITY_CONFIG, {
      apiKey: 'test-perplexity-key',
    });
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig().endpoint).toBe('https://api.perplexity.ai');
    expect(provider.getConfig().modelId).toBe('sonar');
  });
});

describe('Perplexity adapter resolution', () => {
  it('reuses the shared chat-completions adapter module', () => {
    expect(providerAdapter.adapterKey).toBe('chat-completions');
  });

  it('resolves to the chat-completions adapter from a perplexity-vendor config', () => {
    expect(resolveAdapterKeyFromConfig({ getConfig: () => ({ vendor: 'perplexity' }) })).toBe(
      'chat-completions',
    );
    expect(resolveAdapter('chat-completions').capabilities.nativeToolUse).toBe(true);
  });
});
