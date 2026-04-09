import { describe, expect, it } from 'vitest';
import { resolveAdapter } from '../../../agent-gateway/adapters/index.js';

describe('resolveAdapter', () => {
  it('returns Ollama adapter for ollama (nativeToolUse + extendedThinking)', () => {
    const adapter = resolveAdapter('ollama');
    expect(adapter.capabilities.nativeToolUse).toBe(true);
    expect(adapter.capabilities.cacheControl).toBe(false);
    expect(adapter.capabilities.extendedThinking).toBe(true);
    expect(adapter.capabilities.streaming).toBe(true);
  });

  it('returns OpenAI adapter for openai (nativeToolUse true)', () => {
    const adapter = resolveAdapter('openai');
    expect(adapter.capabilities.nativeToolUse).toBe(true);
  });

  it('returns Anthropic adapter for anthropic (all capabilities true)', () => {
    const adapter = resolveAdapter('anthropic');
    expect(adapter.capabilities.nativeToolUse).toBe(true);
    expect(adapter.capabilities.cacheControl).toBe(true);
    expect(adapter.capabilities.extendedThinking).toBe(true);
    expect(adapter.capabilities.streaming).toBe(true);
  });

  it('returns text adapter for unknown provider type (fallback)', () => {
    const adapter = resolveAdapter('unknown-provider');
    expect(adapter.capabilities.nativeToolUse).toBe(false);
  });

  it('returns text adapter for empty string (fallback)', () => {
    const adapter = resolveAdapter('');
    expect(adapter.capabilities.nativeToolUse).toBe(false);
  });
});
