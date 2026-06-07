import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
} from '../../definitions/index.js';

const expectedDefinitions = {
  anthropic: {
    wellKnownProviderId: '10000000-0000-0000-0000-000000000001',
    defaultEndpoint: 'https://api.anthropic.com',
    defaultModelId: 'claude-sonnet-4-20250514',
    envVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    wellKnownProviderId: '10000000-0000-0000-0000-000000000002',
    defaultEndpoint: 'https://api.openai.com',
    defaultModelId: 'gpt-4o',
    envVar: 'OPENAI_API_KEY',
  },
  ollama: {
    wellKnownProviderId: '10000000-0000-0000-0000-000000000003',
    defaultEndpoint: 'http://localhost:11434',
    defaultModelId: 'llama3.2',
    envVar: undefined,
  },
} as const;

describe('provider definitions catalog', () => {
  it('contains exactly the current validation roster by vendorKey', () => {
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey).sort()).toEqual([
      'anthropic',
      'ollama',
      'openai',
    ]);
  });

  it('validates every definition through ProviderDefinitionSchema', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(ProviderDefinitionSchema.parse(definition)).toEqual(definition);
    }
  });

  it('carries required bootstrap metadata for current providers', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const expected = expectedDefinitions[
        definition.vendorKey as keyof typeof expectedDefinitions
      ];

      expect(definition.wellKnownProviderId).toBe(expected.wellKnownProviderId);
      expect(definition.defaultEndpoint).toBe(expected.defaultEndpoint);
      expect(definition.defaultModelId).toBe(expected.defaultModelId);
      expect('envVar' in definition.auth ? definition.auth.envVar : undefined).toBe(
        expected.envVar,
      );
      expect(definition.providerType).toBe('text');
      expect(definition.auth.purpose).toBe('api_key');
    }
  });

  it('keeps provider definition leaves metadata-only', () => {
    const definitionsDir = dirname(fileURLToPath(import.meta.url))
      .replace(`${join('src', '__tests__', 'definitions')}`, join('src', 'definitions'));
    const leafFiles = ['anthropic.ts', 'chat-completions.ts', 'ollama.ts'];
    const forbidden = [
      /fetch/,
      /process\.env/,
      /new (AnthropicProvider|ChatCompletionsProvider|OllamaProvider)/,
      /from ['"].*provider\.js['"]/,
    ];

    for (const file of leafFiles) {
      const source = readFileSync(join(definitionsDir, file), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
