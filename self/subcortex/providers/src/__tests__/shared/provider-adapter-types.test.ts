import { describe, expect, it } from 'vitest';
import {
  defineProviderAdapter,
  type ProviderAdapter,
} from '../../schemas/provider-adapter.js';

const adapter: ProviderAdapter = {
  capabilities: {
    nativeToolUse: false,
    cacheControl: false,
    extendedThinking: false,
    streaming: false,
  },
  formatRequest(input) {
    return { input: { prompt: input.systemPrompt } };
  },
  parseResponse(output) {
    return {
      response: String(output ?? ''),
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  },
};

describe('defineProviderAdapter', () => {
  it('validates and returns the original module object', () => {
    const module = {
      adapterKey: 'fixture-adapter',
      displayName: 'Fixture Adapter',
      protocol: 'fixture',
      capabilities: adapter.capabilities,
      create() {
        return adapter;
      },
    } as const;

    const result = defineProviderAdapter(module);

    expect(result).toBe(module);
    expect(result.adapterKey).toBe('fixture-adapter');
  });

  it('rejects missing required metadata', () => {
    expect(() => defineProviderAdapter({
      adapterKey: '',
      displayName: 'Broken Adapter',
      protocol: 'broken',
      capabilities: adapter.capabilities,
      create() {
        return adapter;
      },
    })).toThrow();
  });

  it('rejects incomplete capabilities instead of defaulting them', () => {
    expect(() => defineProviderAdapter({
      adapterKey: 'broken',
      displayName: 'Broken Adapter',
      protocol: 'broken',
      capabilities: {
        nativeToolUse: false,
        cacheControl: false,
        extendedThinking: false,
      },
      create() {
        return adapter;
      },
    } as never)).toThrow();
  });
});
