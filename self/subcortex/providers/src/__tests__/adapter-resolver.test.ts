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
    // `chat-completions` appears multiple times: deepinfra, groq,
    // huggingface-tgi, llama-cpp, moonshot, openai, openrouter, perplexity,
    // and vllm all reuse the shared chat-completions adapter. mistral uses
    // its own adapterKey for resolver isolation.
    // The resolver keys modules by adapterKey, so the duplicates collapse to a single
    // resolvable module. Order follows the generated CERTIFIED_PROVIDER_ADAPTER_MODULES
    // (alphabetical by vendor) with the text fallback appended last.
    expect(ADAPTER_MODULES.map((module) => module.adapterKey)).toEqual([
      'anthropic',
      'codex-cli',
      'chat-completions',
      'gemini',
      'github-copilot-cli',
      'chat-completions',
      'chat-completions',
      'chat-completions',
      'mistral',
      'chat-completions',
      'ollama',
      'chat-completions',
      'openclaw',
      'chat-completions',
      'chat-completions',
      'chat-completions',
      'openclaw',
      'chat-completions',
      'chat-completions',
      'chat-completions',
      'qwen-code',
      'text',
    ]);
  });

  it('resolves canonical adapter keys', () => {
    expect(resolveAdapter('anthropic').capabilities.cacheControl).toBe(true);
    expect(resolveAdapter('chat-completions').capabilities.nativeToolUse).toBe(true);
    expect(resolveAdapter('codex-cli').capabilities.streaming).toBe(true);
    expect(resolveAdapter('gemini').capabilities.streaming).toBe(true);
    expect(resolveAdapter('github-copilot-cli').capabilities.nativeToolUse).toBe(false);
    expect(resolveAdapter('mistral').capabilities.nativeToolUse).toBe(false);
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
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'gemini' }))).toBe('gemini');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'deepinfra' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'github-copilot-cli' }))).toBe('github-copilot-cli');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'groq' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'llama-cpp' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'mistral' }))).toBe('mistral');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'ollama' }))).toBe('ollama');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'moonshot' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'openclaw' }))).toBe('openclaw');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'openrouter' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'perplexity' }))).toBe('chat-completions');
  });

  it('falls back to name heuristic for non-catalog provider configs', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'claude-3-opus' }))).toBe('anthropic');
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'gpt-4-turbo' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'unknown-vendor', name: 'my-gpt-model' }))).toBe('chat-completions');
    expect(resolveAdapterKeyFromConfig(makeProvider({ name: 'ollama-llama3' }))).toBe('ollama');
  });

  it('falls back to text when provider config cannot resolve', () => {
    expect(resolveAdapterKeyFromConfig(makeProvider({ vendor: 'unknown-vendor', name: 'custom-model' }))).toBe('text');
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
