import { describe, expect, it, vi } from 'vitest';

import type { ProviderDefinition } from '@nous/subcortex-providers';
import { fetchProviderModels } from '../src/provider-model-discovery';

function providerDefinition(
  overrides: Partial<ProviderDefinition> = {},
): ProviderDefinition {
  return {
    vendorKey: 'fixture' as ProviderDefinition['vendorKey'],
    displayName: 'Fixture AI',
    wellKnownProviderId: '10000000-0000-0000-0000-000000000005' as ProviderDefinition['wellKnownProviderId'],
    providerType: 'text',
    providerClass: 'remote_text',
    protocol: 'chat-completions',
    adapterKey: 'chat-completions',
    defaultEndpoint: 'https://fixture.example.com',
    defaultModelId: 'fixture-default',
    auth: {
      envVar: 'FIXTURE_API_KEY',
      vaultKeyNamespace: 'fixture',
      header: {
        name: 'X-Fixture-Key',
        scheme: 'raw',
      },
      required: true,
      purpose: 'api_key',
    },
    isLocal: false,
    modelListEndpoint: '/v1/models',
    capabilities: { streaming: true, modelListing: true },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('provider model discovery', () => {
  it('returns all OpenAI-format model IDs without prefix filtering', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      object: 'list',
      data: [
        { id: 'fixture-chat', object: 'model', owned_by: 'fixture' },
        { id: 'fixture-embedding', object: 'model', owned_by: 'fixture' },
      ],
    }));

    const result = await fetchProviderModels(
      providerDefinition({ modelListFormat: 'openai-models' }),
      'fixture-key',
      fetchImpl,
    );

    expect(result).toEqual({
      cacheable: true,
      models: [
        {
          id: 'fixture:fixture-chat',
          name: 'fixture-chat',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: true,
        },
        {
          id: 'fixture:fixture-embedding',
          name: 'fixture-embedding',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: true,
        },
      ],
    });
  });

  it('falls back to the provider default model when discovery fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'upstream' }, 503));

    const result = await fetchProviderModels(
      providerDefinition(),
      'fixture-key',
      fetchImpl,
    );

    expect(result).toEqual({
      cacheable: false,
      models: [
        {
          id: 'fixture:fixture-default',
          name: 'fixture-default (cached)',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: false,
        },
      ],
    });
  });

  it('supports no-auth local providers through model-list metadata', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      return jsonResponse({
        object: 'list',
        data: [{ id: 'llama3.2:3b', object: 'model', owned_by: 'ollama' }],
      });
    });

    const result = await fetchProviderModels(
      providerDefinition({
        vendorKey: 'ollama' as ProviderDefinition['vendorKey'],
        displayName: 'Ollama',
        protocol: 'ollama',
        adapterKey: 'ollama',
        defaultEndpoint: 'http://localhost:11434',
        defaultModelId: 'llama3.2',
        auth: {
          required: false,
          purpose: 'api_key',
        },
        isLocal: true,
        modelListEndpoint: '/v1/models',
        modelListFormat: 'openai-models',
      }),
      '',
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:11434/v1/models', {
      method: 'GET',
      headers: {},
    });
    expect(result.models).toEqual([
      {
        id: 'ollama:llama3.2:3b',
        name: 'llama3.2:3b',
        provider: 'ollama',
        providerLabel: 'Ollama',
        available: true,
      },
    ]);
  });

  it('uses a resolved base URL override for provider model discovery', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      object: 'list',
      data: [{ id: 'llama3.2:3b', object: 'model', owned_by: 'ollama' }],
    }));

    await fetchProviderModels(
      providerDefinition({
        vendorKey: 'ollama' as ProviderDefinition['vendorKey'],
        displayName: 'Ollama',
        protocol: 'ollama',
        adapterKey: 'ollama',
        defaultEndpoint: 'http://localhost:11434',
        defaultModelId: 'llama3.2',
        auth: {
          required: false,
          purpose: 'api_key',
        },
        isLocal: true,
        modelListEndpoint: '/v1/models',
        modelListFormat: 'openai-models',
      }),
      '',
      fetchImpl,
      { baseUrl: 'http://configured-ollama:11435' },
    );

    expect(fetchImpl).toHaveBeenCalledWith('http://configured-ollama:11435/v1/models', {
      method: 'GET',
      headers: {},
    });
  });
});
