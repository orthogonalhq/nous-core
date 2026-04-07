import { describe, expect, it } from 'vitest';
import { resolveAdapter } from '../../../agent-gateway/adapters/index.js';

describe('resolveAdapter', () => {
  it('returns text adapter for ollama (capabilities all false)', () => {
    const adapter = resolveAdapter('ollama');
    expect(adapter.capabilities.nativeToolUse).toBe(false);
    expect(adapter.capabilities.cacheControl).toBe(false);
    expect(adapter.capabilities.extendedThinking).toBe(false);
    expect(adapter.capabilities.streaming).toBe(false);
  });

  it('returns OpenAI adapter for openai (nativeToolUse true)', () => {
    const adapter = resolveAdapter('openai');
    expect(adapter.capabilities.nativeToolUse).toBe(true);
  });

  it('throws for anthropic with descriptive error', () => {
    expect(() => resolveAdapter('anthropic')).toThrow(
      'Anthropic adapter not yet implemented',
    );
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
