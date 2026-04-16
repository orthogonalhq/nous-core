import { describe, it, expect } from 'vitest';
import {
  KNOWN_PROVIDER_VENDORS,
  ModelProviderConfigSchema,
  ModelRequestSchema,
  ModelResponseSchema,
  ModelStreamChunkSchema,
  type ProviderVendor,
} from '../../types/provider.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('ModelProviderConfigSchema', () => {
  const validConfig = {
    id: VALID_UUID,
    name: 'Ollama Local',
    type: 'text',
    modelId: 'llama3.2:3b',
    isLocal: true,
    capabilities: ['text-generation'],
  };

  it('accepts a valid local provider config', () => {
    expect(ModelProviderConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it('accepts a remote provider with endpoint', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...validConfig,
      isLocal: false,
      endpoint: 'https://api.openai.com/v1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid provider type', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...validConfig,
      type: 'audio',
    });
    expect(result.success).toBe(false);
  });
});

describe('ModelProviderConfigSchema vendor field (WR-138)', () => {
  const baseFixture = {
    id: VALID_UUID,
    name: 'Test Provider',
    type: 'text' as const,
    modelId: 'test-model',
    isLocal: false,
    capabilities: ['text-generation'],
  };

  it('accepts known vendor "anthropic"', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: 'anthropic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts known vendor "openai"', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: 'openai',
    });
    expect(result.success).toBe(true);
  });

  it('accepts known vendor "ollama"', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: 'ollama',
    });
    expect(result.success).toBe(true);
  });

  it('accepts known vendor "text"', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: 'text',
    });
    expect(result.success).toBe(true);
  });

  it('accepts unknown vendor "totally-new-vendor" (open-string acceptance per PVF AC #6)', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: 'totally-new-vendor',
    });
    expect(result.success).toBe(true);
  });

  it('accepts vendor: undefined (optional field)', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('accepts fixture without vendor field (omitted entirely)', () => {
    const result = ModelProviderConfigSchema.safeParse(baseFixture);
    expect(result.success).toBe(true);
  });

  it('rejects empty-string vendor (z.string().min(1) invariant)', () => {
    const result = ModelProviderConfigSchema.safeParse({
      ...baseFixture,
      vendor: '',
    });
    expect(result.success).toBe(false);
  });

  it('KNOWN_PROVIDER_VENDORS contains the four baseline vendor keys', () => {
    expect(KNOWN_PROVIDER_VENDORS).toContain('anthropic');
    expect(KNOWN_PROVIDER_VENDORS).toContain('openai');
    expect(KNOWN_PROVIDER_VENDORS).toContain('ollama');
    expect(KNOWN_PROVIDER_VENDORS).toContain('text');
    expect(KNOWN_PROVIDER_VENDORS.length).toBe(4);
  });

  it('type-level: ProviderVendor accepts known and unknown string literals', () => {
    // These assignments must compile at type-check time. The
    // `KnownProviderVendor | (string & {})` open-union idiom preserves
    // autocomplete on the known values while still accepting arbitrary
    // strings at the type level (PVF AC #3).
    const known: ProviderVendor = 'anthropic';
    const alsoKnown: ProviderVendor = 'openai';
    const unknown: ProviderVendor = 'totally-new-vendor';
    expect(typeof known).toBe('string');
    expect(typeof alsoKnown).toBe('string');
    expect(typeof unknown).toBe('string');
  });
});

describe('ModelRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = ModelRequestSchema.safeParse({
      role: 'cortex-chat',
      input: { prompt: 'Analyze this deal' },
      traceId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional agentClass and abortSignal fields', () => {
    const controller = new AbortController();
    const result = ModelRequestSchema.safeParse({
      role: 'cortex-chat',
      input: { prompt: 'Analyze this deal' },
      traceId: VALID_UUID,
      agentClass: 'Worker',
      abortSignal: controller.signal,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = ModelRequestSchema.safeParse({
      role: 'invalid',
      input: {},
      traceId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

describe('ModelResponseSchema', () => {
  it('accepts a valid response', () => {
    const result = ModelResponseSchema.safeParse({
      output: 'This deal looks promising',
      providerId: VALID_UUID,
      usage: { inputTokens: 100, outputTokens: 50, computeMs: 1200 },
      traceId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts response with optional usage fields', () => {
    const result = ModelResponseSchema.safeParse({
      output: 'Response',
      providerId: VALID_UUID,
      usage: {},
      traceId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe('ModelStreamChunkSchema', () => {
  it('accepts a content chunk', () => {
    const result = ModelStreamChunkSchema.safeParse({
      content: 'Hello',
      done: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a final chunk with usage', () => {
    const result = ModelStreamChunkSchema.safeParse({
      content: '',
      done: true,
      usage: { inputTokens: 10, outputTokens: 50 },
    });
    expect(result.success).toBe(true);
  });
});
