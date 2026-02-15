import { describe, it, expect } from 'vitest';
import {
  ModelProviderConfigSchema,
  ModelRequestSchema,
  ModelResponseSchema,
  ModelStreamChunkSchema,
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

describe('ModelRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = ModelRequestSchema.safeParse({
      role: 'reasoner',
      input: { prompt: 'Analyze this deal' },
      traceId: VALID_UUID,
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
