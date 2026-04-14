/**
 * resolveProviderTypeFromConfig — vendor-field-first resolution.
 *
 * WR-160 Phase 1.1 — Tier 2 behavior test.
 * Validates vendor-first resolution, name-heuristic fallback, and error handling.
 */
import { describe, expect, it } from 'vitest';
import { resolveProviderTypeFromConfig } from '../../../agent-gateway/adapters/index.js';

function makeProvider(config: { name?: string; type?: string; vendor?: string }) {
  return { getConfig: () => config };
}

function makeThrowingProvider() {
  return {
    getConfig() {
      throw new Error('config unavailable');
    },
  };
}

describe('resolveProviderTypeFromConfig', () => {
  describe('vendor-first resolution', () => {
    it('returns "anthropic" when vendor is "anthropic"', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ vendor: 'anthropic' }))).toBe('anthropic');
    });

    it('returns "openai" when vendor is "openai"', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ vendor: 'openai' }))).toBe('openai');
    });

    it('returns "ollama" when vendor is "ollama"', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ vendor: 'ollama' }))).toBe('ollama');
    });
  });

  describe('name-heuristic fallback', () => {
    it('falls back to "anthropic" via name when vendor is absent', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ name: 'claude-3-opus' }))).toBe('anthropic');
    });

    it('falls back to "openai" via name when vendor is absent', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ name: 'gpt-4-turbo' }))).toBe('openai');
    });

    it('falls back to "ollama" via name when vendor is absent', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ name: 'ollama-llama3' }))).toBe('ollama');
    });

    it('falls back to name heuristic when vendor is unrecognized', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ vendor: 'groq', name: 'my-gpt-model' }))).toBe('openai');
    });
  });

  describe('fallback to "text"', () => {
    it('returns "text" when vendor is undefined and name is undefined', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({}))).toBe('text');
    });

    it('returns "text" when vendor is unrecognized and name has no match', () => {
      expect(resolveProviderTypeFromConfig(makeProvider({ vendor: 'groq', name: 'custom-model' }))).toBe('text');
    });
  });

  describe('error handling', () => {
    it('returns "text" when getConfig() throws', () => {
      expect(resolveProviderTypeFromConfig(makeThrowingProvider())).toBe('text');
    });
  });
});
