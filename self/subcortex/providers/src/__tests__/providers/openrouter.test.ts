import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@nous/shared';
import {
  OPENROUTER_DEFAULT_ENDPOINT,
  OPENROUTER_DEFAULT_MODEL_ID,
  OPENROUTER_PROVIDER_DEFINITION,
  providerDefinition,
  providerFactory,
} from '../../providers/openrouter/index.js';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';

const MOCK_CONFIG = {
  id: deriveBuiltInProviderId('openrouter'),
  name: 'OpenRouter',
  type: 'text' as const,
  modelId: OPENROUTER_DEFAULT_MODEL_ID,
  isLocal: false,
  capabilities: ['text'],
};

describe('OpenRouter provider leaf', () => {
  it('exposes OpenRouter-specific OpenAI-compatible metadata', () => {
    expect(providerDefinition).toBe(OPENROUTER_PROVIDER_DEFINITION);
    expect(OPENROUTER_PROVIDER_DEFINITION.vendorKey).toBe('openrouter');
    expect(OPENROUTER_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(OPENROUTER_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
    expect(OPENROUTER_PROVIDER_DEFINITION.defaultEndpoint).toBe(OPENROUTER_DEFAULT_ENDPOINT);
    expect(OPENROUTER_DEFAULT_ENDPOINT).toBe('https://openrouter.ai/api');
    expect(OPENROUTER_PROVIDER_DEFINITION.defaultModelId).toBe('openrouter/auto');
    expect(OPENROUTER_PROVIDER_DEFINITION.auth.envVar).toBe('OPENROUTER_API_KEY');
    expect(OPENROUTER_PROVIDER_DEFINITION.auth.header).toEqual({
      name: 'Authorization',
      scheme: 'bearer',
    });
    expect(OPENROUTER_PROVIDER_DEFINITION.modelListEndpoint).toBe('/v1/models');
    expect(OPENROUTER_PROVIDER_DEFINITION.modelListFormat).toBe('openai-models');
  });

  it('advertises streaming and model listing but not nativeToolUse (pending the #390 tool-use bridge)', () => {
    expect(OPENROUTER_PROVIDER_DEFINITION.capabilities?.streaming).toBe(true);
    expect(OPENROUTER_PROVIDER_DEFINITION.capabilities?.modelListing).toBe(true);
    expect('nativeToolUse' in (OPENROUTER_PROVIDER_DEFINITION.capabilities ?? {})).toBe(false);
  });

  it('does not hand-author wellKnownProviderId (derived centrally from vendorKey)', () => {
    expect('wellKnownProviderId' in OPENROUTER_PROVIDER_DEFINITION).toBe(false);
  });

  it('satisfies the shared ProviderDefinitionSchema once hydrated with a derived id', () => {
    const hydrated = {
      ...OPENROUTER_PROVIDER_DEFINITION,
      wellKnownProviderId: deriveBuiltInProviderId('openrouter') as ProviderId,
    };
    expect(() => ProviderDefinitionSchema.parse(hydrated)).not.toThrow();
  });

  it('factory builds a ChatCompletionsProvider for the openrouter vendor', () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-openrouter-key' });
    expect(providerFactory.vendorKey).toBe('openrouter');
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });
});
