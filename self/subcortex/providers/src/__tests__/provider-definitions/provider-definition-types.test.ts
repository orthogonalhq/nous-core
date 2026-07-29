import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DEFINITIONS,
  defineProvider,
  type BootstrapProviderKey,
  type ProviderDefinition,
  type ProviderVendorKey,
} from '../../provider-definitions.js';
import type { ProviderId } from '@nous/shared';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type _ProviderVendorKeyIsExact = Expect<
  Equal<ProviderVendorKey, 'anthropic' | 'azure-openai' | 'codex-cli' | 'deepinfra' | 'gemini' | 'github-copilot-cli' | 'groq' | 'huggingface-tgi' | 'llama-cpp' | 'mistral' | 'moonshot' | 'openai' | 'ollama' | 'openclaw' | 'openrouter' | 'perplexity' | 'qwen-code' | 'vllm' | 'xai'>
>;
type _BootstrapProviderKeyIsExact = Expect<
  Equal<BootstrapProviderKey, 'anthropic' | 'azure-openai' | 'codex-cli' | 'deepinfra' | 'gemini' | 'github-copilot-cli' | 'groq' | 'huggingface-tgi' | 'llama-cpp' | 'mistral' | 'moonshot' | 'openai' | 'ollama' | 'openclaw' | 'openrouter' | 'perplexity' | 'qwen-code' | 'vllm' | 'xai'>
>;

type _ProviderVendorKeyDoesNotWiden = Expect<Equal<string extends ProviderVendorKey ? true : false, false>>;

describe('provider definition type derivation', () => {
  it('derives runtime roster keys from the production tuple', () => {
    const keys: ProviderVendorKey[] = PROVIDER_DEFINITIONS.map(
      (definition) => definition.vendorKey,
    );
    expect(keys.sort()).toEqual([
      'anthropic',
      'azure-openai',
      'codex-cli',
      'deepinfra',
      'gemini',
      'github-copilot-cli',
      'groq',
      'huggingface-tgi',
      'llama-cpp',
      'mistral',
      'moonshot',
      'ollama',
      'openai',
      'openclaw',
      'openrouter',
      'perplexity',
      'qwen-code',
      'vllm',
      'xai',
    ]);
  });

  it('supports local leaf-addition fixtures without production branch logic', () => {
    const mockDefinition = defineProvider({
      vendorKey: 'mock-vendor',
      displayName: 'Mock Vendor',
      wellKnownProviderId: '20000000-0000-0000-0000-000000000001' as ProviderId,
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'mock-protocol',
      adapterKey: 'mock-adapter',
      defaultEndpoint: 'https://mock.example.com',
      defaultModelId: 'mock-model',
      auth: {
        envVar: 'MOCK_API_KEY',
        vaultKeyNamespace: 'mock',
        required: true,
        purpose: 'api_key',
      },
      isLocal: false,
    });

    const fixtureDefinitions = [
      ...PROVIDER_DEFINITIONS,
      mockDefinition,
    ] as const satisfies readonly ProviderDefinition[];
    type FixtureVendorKey = (typeof fixtureDefinitions)[number]['vendorKey'];
    type _FixtureIncludesMock = Expect<
      Equal<FixtureVendorKey, ProviderVendorKey | 'mock-vendor'>
    >;

    expect(fixtureDefinitions.map((definition) => definition.vendorKey)).toContain('mock-vendor');
  });
});
