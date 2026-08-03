import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@nous/shared';
import {
  GROQ_DEFAULT_ENDPOINT,
  GROQ_DEFAULT_MODEL_ID,
  GROQ_PROVIDER_DEFINITION,
  providerDefinition,
  providerFactory,
} from '../../providers/groq/index.js';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';

const MOCK_CONFIG = {
  id: deriveBuiltInProviderId('groq'),
  name: 'Groq',
  type: 'text' as const,
  modelId: GROQ_DEFAULT_MODEL_ID,
  isLocal: false,
  capabilities: ['text'],
};

describe('Groq provider leaf', () => {
  it('exposes Groq-specific OpenAI-compatible metadata', () => {
    expect(providerDefinition).toBe(GROQ_PROVIDER_DEFINITION);
    expect(GROQ_PROVIDER_DEFINITION.vendorKey).toBe('groq');
    expect(GROQ_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(GROQ_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
    expect(GROQ_PROVIDER_DEFINITION.defaultEndpoint).toBe(GROQ_DEFAULT_ENDPOINT);
    expect(GROQ_DEFAULT_ENDPOINT).toBe('https://api.groq.com/openai');
    expect(GROQ_PROVIDER_DEFINITION.defaultModelId).toBe('llama-3.3-70b-versatile');
    expect(GROQ_PROVIDER_DEFINITION.auth.envVar).toBe('GROQ_API_KEY');
    expect(GROQ_PROVIDER_DEFINITION.auth.header).toEqual({
      name: 'Authorization',
      scheme: 'bearer',
    });
    expect(GROQ_PROVIDER_DEFINITION.modelListEndpoint).toBe('/v1/models');
    expect(GROQ_PROVIDER_DEFINITION.modelListFormat).toBe('openai-models');
  });

  it('advertises streaming and model listing but not nativeToolUse (pending the #390 tool-use bridge)', () => {
    expect(GROQ_PROVIDER_DEFINITION.capabilities?.streaming).toBe(true);
    expect(GROQ_PROVIDER_DEFINITION.capabilities?.modelListing).toBe(true);
    expect('nativeToolUse' in (GROQ_PROVIDER_DEFINITION.capabilities ?? {})).toBe(false);
  });

  it('does not hand-author wellKnownProviderId (derived centrally from vendorKey)', () => {
    expect('wellKnownProviderId' in GROQ_PROVIDER_DEFINITION).toBe(false);
  });

  it('satisfies the shared ProviderDefinitionSchema once hydrated with a derived id', () => {
    const hydrated = {
      ...GROQ_PROVIDER_DEFINITION,
      wellKnownProviderId: deriveBuiltInProviderId('groq') as ProviderId,
    };
    expect(() => ProviderDefinitionSchema.parse(hydrated)).not.toThrow();
  });

  it('factory builds a ChatCompletionsProvider for the groq vendor', () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-groq-key' });
    expect(providerFactory.vendorKey).toBe('groq');
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });
});
