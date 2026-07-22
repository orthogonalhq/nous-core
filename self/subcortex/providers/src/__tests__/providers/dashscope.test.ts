import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError } from '@nous/shared';
import {
  DASHSCOPE_DEFAULT_ENDPOINT,
  DASHSCOPE_DEFAULT_MODEL_ID,
  DASHSCOPE_PROVIDER_DEFINITION,
  providerDefinition,
  providerFactory,
} from '../../providers/dashscope/index.js';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';

const MOCK_CONFIG = {
  id: deriveBuiltInProviderId('dashscope'),
  name: 'DashScope (Qwen)',
  type: 'text' as const,
  modelId: DASHSCOPE_DEFAULT_MODEL_ID,
  isLocal: false,
  capabilities: ['text'],
};

describe('DashScope provider leaf', () => {
  const originalDashScopeKey = process.env.DASHSCOPE_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalDashScopeKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashScopeKey;
    }
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it('exposes DashScope-specific OpenAI-compatible metadata', () => {
    expect(providerDefinition).toBe(DASHSCOPE_PROVIDER_DEFINITION);
    expect(DASHSCOPE_PROVIDER_DEFINITION.vendorKey).toBe('dashscope');
    expect(DASHSCOPE_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(DASHSCOPE_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
    expect(DASHSCOPE_PROVIDER_DEFINITION.defaultEndpoint).toBe(DASHSCOPE_DEFAULT_ENDPOINT);
    expect(DASHSCOPE_DEFAULT_ENDPOINT).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode',
    );
    expect(DASHSCOPE_DEFAULT_ENDPOINT.endsWith('/v1')).toBe(false);
    expect(DASHSCOPE_PROVIDER_DEFINITION.defaultModelId).toBe('qwen-plus');
    expect(DASHSCOPE_PROVIDER_DEFINITION.auth.envVar).toBe('DASHSCOPE_API_KEY');
    expect(DASHSCOPE_PROVIDER_DEFINITION.auth.header).toEqual({
      name: 'Authorization',
      scheme: 'bearer',
    });
    expect(DASHSCOPE_PROVIDER_DEFINITION.modelListEndpoint).toBe('/v1/models');
    expect(DASHSCOPE_PROVIDER_DEFINITION.modelListFormat).toBe('openai-models');
    expect('healthCheckEndpoint' in DASHSCOPE_PROVIDER_DEFINITION).toBe(false);
  });

  it('advertises streaming and model listing but not nativeToolUse (pending the #390 tool-use bridge)', () => {
    expect(DASHSCOPE_PROVIDER_DEFINITION.capabilities?.streaming).toBe(true);
    expect(DASHSCOPE_PROVIDER_DEFINITION.capabilities?.modelListing).toBe(true);
    expect('nativeToolUse' in (DASHSCOPE_PROVIDER_DEFINITION.capabilities ?? {})).toBe(false);
  });

  it('does not hand-author wellKnownProviderId (derived centrally from vendorKey)', () => {
    expect('wellKnownProviderId' in DASHSCOPE_PROVIDER_DEFINITION).toBe(false);
  });

  it('satisfies the shared ProviderDefinitionSchema once hydrated with a derived id', () => {
    const hydrated = {
      ...DASHSCOPE_PROVIDER_DEFINITION,
      wellKnownProviderId: deriveBuiltInProviderId('dashscope') as ProviderId,
    };
    expect(() => ProviderDefinitionSchema.parse(hydrated)).not.toThrow();
  });

  it('factory builds a ChatCompletionsProvider for the dashscope vendor', () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-dashscope-key' });
    expect(providerFactory.vendorKey).toBe('dashscope');
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('factory throws when no DashScope API key is available', () => {
    expect(() => providerFactory.create(MOCK_CONFIG, {})).toThrow(NousError);
    expect(() => providerFactory.create(MOCK_CONFIG, {})).toThrow(
      'DashScope API key required — set DASHSCOPE_API_KEY or pass apiKey option',
    );
  });

  it('factory does not fall back to OPENAI_API_KEY when DashScope key is missing', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    expect(() => providerFactory.create(MOCK_CONFIG, {})).toThrow(NousError);
    expect(() => providerFactory.create(MOCK_CONFIG, {})).toThrow(
      'DashScope API key required — set DASHSCOPE_API_KEY or pass apiKey option',
    );
  });

  it('factory resolves DASHSCOPE_API_KEY from the environment when options omit apiKey', () => {
    process.env.DASHSCOPE_API_KEY = 'env-dashscope-key';

    const provider = providerFactory.create(MOCK_CONFIG, {});
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });
});
