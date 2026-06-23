import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
} from '../../provider-definitions.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';
import { ProviderDefinitionSchema as SchemaProviderDefinitionSchema } from '../../schemas/provider-definition.js';

const expectedDefinitions = {
  anthropic: {
    defaultEndpoint: 'https://api.anthropic.com',
    defaultModelId: 'claude-sonnet-4-20250514',
    envVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    defaultEndpoint: 'https://api.openai.com',
    defaultModelId: 'gpt-4o',
    envVar: 'OPENAI_API_KEY',
  },
  'codex-cli': {
    defaultEndpoint: 'http://localhost',
    defaultModelId: 'codex-cli/default',
    envVar: undefined,
  },
  ollama: {
    defaultEndpoint: 'http://localhost:11434',
    defaultModelId: 'llama3.2',
    envVar: undefined,
  },
  groq: {
    defaultEndpoint: 'https://api.groq.com/openai',
    defaultModelId: 'llama-3.3-70b-versatile',
    envVar: 'GROQ_API_KEY',
  },
  'llama-cpp': {
    defaultEndpoint: 'http://localhost:8080',
    defaultModelId: 'llama3.2',
    envVar: undefined,
  },
  openrouter: {
    defaultEndpoint: 'https://openrouter.ai/api',
    defaultModelId: 'openrouter/auto',
    envVar: 'OPENROUTER_API_KEY',
  },
} as const;

describe('provider definitions catalog', () => {
  it('contains exactly the current validation roster by vendorKey', () => {
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey).sort()).toEqual([
      'anthropic',
      'codex-cli',
      'groq',
      'llama-cpp',
      'ollama',
      'openai',
      'openrouter',
    ]);
  });

  it('validates every definition through ProviderDefinitionSchema', () => {
    expect(ProviderDefinitionSchema).toBe(SchemaProviderDefinitionSchema);
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(ProviderDefinitionSchema.parse(definition)).toEqual(definition);
    }
  });

  it('carries required bootstrap metadata for current providers', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const expected = expectedDefinitions[
        definition.vendorKey as keyof typeof expectedDefinitions
      ];

      expect(definition.wellKnownProviderId).toBe(
        deriveBuiltInProviderId(definition.vendorKey),
      );
      expect(definition.defaultEndpoint).toBe(expected.defaultEndpoint);
      expect(definition.defaultModelId).toBe(expected.defaultModelId);
      expect('envVar' in definition.auth ? definition.auth.envVar : undefined).toBe(
        expected.envVar,
      );
      expect(definition.providerType).toBe('text');
      expect(definition.auth.purpose).toBe('api_key');
    }
  });

  it('keeps provider definition constants metadata-only', () => {
    const providersSrcDir = dirname(fileURLToPath(import.meta.url))
      .replace(`${join('src', '__tests__', 'provider-definitions')}`, 'src');
    const providerFiles = [
      join('providers', 'anthropic', 'implementation.ts'),
      join('providers', 'codex-cli', 'definition.ts'),
      join('protocols', 'openai-api', 'provider.ts'),
      join('providers', 'ollama', 'implementation.ts'),
      join('providers', 'llama-cpp', 'definition.ts'),
    ];
    const forbidden = [
      /fetch/,
      /process\.env/,
      /new (AnthropicProvider|ChatCompletionsProvider|OllamaProvider)/,
    ];

    for (const file of providerFiles) {
      const source = readFileSync(join(providersSrcDir, file), 'utf8');
      const definitionStart = source.indexOf('_PROVIDER_DEFINITION = {');
      const definitionEnd = source.indexOf('} as const satisfies ProviderDefinitionLeaf;', definitionStart);
      expect(definitionStart).toBeGreaterThanOrEqual(0);
      expect(definitionEnd).toBeGreaterThan(definitionStart);
      const definitionSource = source.slice(
        definitionStart,
        definitionEnd + '} as const satisfies ProviderDefinitionLeaf;'.length,
      );
      expect(definitionSource).not.toContain('wellKnownProviderId');
      for (const pattern of forbidden) {
        expect(definitionSource).not.toMatch(pattern);
      }
    }
  });
});
