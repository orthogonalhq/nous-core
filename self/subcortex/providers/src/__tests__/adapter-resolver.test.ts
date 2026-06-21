import { describe, expect, it } from 'vitest';
import {
  ADAPTER_MODULES,
  buildAdapterResolver,
  normalizeAdapterKey,
  resolveAdapter,
  resolveAdapterKeyFromConfig,
} from '../adapter-resolver.js';
import { defineProviderAdapter } from '../schemas/provider-adapter.js';
import { textAdapter } from '../shared/text-adapter.js';
import type { ProviderAdapter } from '../schemas/provider-adapter.js';

const testAdapter: ProviderAdapter = {
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

function makeProvider(config: {
  name?: string;
  type?: string;
  vendor?: string;
  adapterKey?: string;
}) {
  return { getConfig: () => config };
}

function makeThrowingProvider() {
  return {
    getConfig() {
      throw new Error('config unavailable');
    },
  };
}

describe('adapter resolver', () => {
  it('aggregates all canonical adapter modules', () => {
    expect(ADAPTER_MODULES.map((module) => module.adapterKey)).toEqual([
      'anthropic',
      'codex-cli',
      'ollama',
      'chat-completions',
      'text',
    ]);
  });

  it('resolves canonical adapter keys', () => {
    expect(resolveAdapter('anthropic').capabilities.cacheControl).toBe(true);
    expect(resolveAdapter('chat-completions').capabilities.nativeToolUse).toBe(true);
    expect(resolveAdapter('codex-cli').capabilities.streaming).toBe(true);
    expect(resolveAdapter('ollama').capabilities.extendedThinking).toBe(true);
    expect(resolveAdapter('text').capabilities.nativeToolUse).toBe(false);
  });

  it('normalizes legacy openai adapter key to chat-completions', () => {
    expect(normalizeAdapterKey('openai')).toBe('chat-completions');
    expect(resolveAdapter('openai').capabilities.nativeToolUse).toBe(true);
  });

  it('falls back to text for unknown or empty adapter keys', () => {
    expect(resolveAdapter('unknown-provider').capabilities).toEqual(textAdapter.capabilities);
    expect(resolveAdapter('').capabilities).toEqual(textAdapter.capabilities);
    expect(resolveAdapter(undefined).capabilities).toEqual(textAdapter.capabilities);
  });

  it('prefers explicit adapterKey in provider config', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ adapterKey: 'ollama' }))).toBe('ollama');
    expect(resolveAdapterKeyFromConfig(makeProvider({ adapterKey: 'openai' }))).toBe('chat-completions');
  });

  it('maps provider definition vendor openai to chat-completions', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'openai' }))).toBe('chat-completions');
  });

  it('resolves current provider definition vendors', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'anthropic' }))).toBe('anthropic');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'codex-cli' }))).toBe('codex-cli');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'ollama' }))).toBe('ollama');
  });

  it('falls back to name heuristic for non-catalog provider configs', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'claude-3-opus' }))).toBe('anthropic');
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'gpt-4-turbo' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'groq', name: 'my-gpt-model' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'ollama-llama3' }))).toBe('ollama');
  });

  it('falls back to text when provider config cannot resolve', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'groq', name: 'custom-model' }))).toBe('text');
    expect(resolveAdapterKeyFromConfig(makeProvider({}))).toBe('text');
    expect(resolveAdapterKeyFromConfig(makeThrowingProvider())).toBe('text');
  });

  it('supports a leaf-addition fixture through typed aggregation', () => {
    const fixtureModule = defineProviderAdapter({
      adapterKey: 'fixture-chat',
      displayName: 'Fixture Chat',
      protocol: 'fixture-chat',
      capabilities: testAdapter.capabilities,
      create() {
        return testAdapter;
      },
    });

    const resolver = buildAdapterResolver([
      ...ADAPTER_MODULES,
      fixtureModule,
    ] as const);

    expect(resolver.resolveModule('fixture-chat')).toBe(fixtureModule);
    expect(resolver.resolveAdapter('fixture-chat')).toBe(testAdapter);
    expect(resolver.resolveAdapter('not-registered').capabilities).toEqual(textAdapter.capabilities);
  });
});
