import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
} from '../../provider-definitions.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';
import { ProviderDefinitionSchema as SchemaProviderDefinitionSchema } from '../../schemas/provider-definition.js';

describe('provider definitions catalog', () => {
  it('contains exactly the current validation roster by vendorKey', () => {
    const keys = PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey);
    expect(keys).toHaveLength(PROVIDER_DEFINITIONS.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('validates every definition through ProviderDefinitionSchema', () => {
    expect(ProviderDefinitionSchema).toBe(SchemaProviderDefinitionSchema);
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(ProviderDefinitionSchema.parse(definition)).toEqual(definition);
    }
  });

  it('carries required bootstrap metadata for current providers', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      expect(definition.wellKnownProviderId).toBe(
        deriveBuiltInProviderId(definition.vendorKey),
      );
      expect(definition.defaultEndpoint).toBeTruthy();
      expect(definition.defaultModelId).toBeTruthy();
      expect(definition.providerType).toBe('text');
      expect(definition.auth.purpose).toBe('api_key');
      if (definition.auth.required) {
        expect('envVar' in definition.auth && definition.auth.envVar).toBeTruthy();
      }
    }
  });

  it('keeps provider definition constants metadata-only', () => {
    const providersSrcDir = dirname(fileURLToPath(import.meta.url))
      .replace(`${join('src', '__tests__', 'provider-definitions')}`, 'src');
    const providerFiles = readdirSync(join(providersSrcDir, 'providers'))
    .filter((name) => !name.startsWith('.'))
    .flatMap((vendor) => {
      const candidates = ['definition.ts', 'implementation.ts'];
      for (const candidate of candidates) {
        const full = join('providers', vendor, candidate);
        if (existsSync(join(providersSrcDir, full))) return [full];
      }
      return [];
    });
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
