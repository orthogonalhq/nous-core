import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { ChatCompletionsProvider } from '../protocols/openai-api/provider.js';
import {
  AZURE_OPENAI_PROVIDER_DEFINITION,
  AZURE_OPENAI_DEFAULT_ENDPOINT,
  AZURE_OPENAI_DEFAULT_MODEL_ID,
} from '../providers/azure-openai/definition.js';
import { providerFactory, buildAzureCompletionsPath } from '../providers/azure-openai/provider.js';

// Mirrors how the runtime builds a config from the definition — a user's
// real Azure resource endpoint and their own deployment name would replace
// these placeholders at config time.
const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000098' as ProviderId,
  name: 'Azure OpenAI',
  type: 'text' as const,
  modelId: 'my-gpt4o-deployment',
  endpoint: 'https://acme-resource.openai.azure.com',
  isLocal: false,
  capabilities: ['text'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000002' as any;

describe('Azure OpenAI provider — definition', () => {
  it('uses a placeholder endpoint/model id that the user must replace', () => {
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.defaultEndpoint).toBe(AZURE_OPENAI_DEFAULT_ENDPOINT);
    expect(AZURE_OPENAI_DEFAULT_ENDPOINT).toBe('https://your-resource.openai.azure.com');
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.defaultModelId).toBe(AZURE_OPENAI_DEFAULT_MODEL_ID);
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.isLocal).toBe(false);
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.providerClass).toBe('remote_text');
  });

  it('requires an API key via AZURE_OPENAI_API_KEY and declares the raw api-key header', () => {
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.auth.required).toBe(true);
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.auth.envVar).toBe('AZURE_OPENAI_API_KEY');
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.auth.purpose).toBe('api_key');
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.auth.header).toEqual({
      name: 'api-key',
      scheme: 'raw',
    });
  });

  it('uses the chat-completions protocol and adapter (same wire format as OpenAI)', () => {
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(AZURE_OPENAI_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
  });

  it('does not declare model-list/health-check discovery (narrowed BYOK scope, #304)', () => {
    expect('modelListEndpoint' in AZURE_OPENAI_PROVIDER_DEFINITION).toBe(false);
    expect('healthCheckEndpoint' in AZURE_OPENAI_PROVIDER_DEFINITION).toBe(false);
    expect('modelListing' in (AZURE_OPENAI_PROVIDER_DEFINITION.capabilities ?? {})).toBe(false);
  });

  it('does not hand-author wellKnownProviderId', () => {
    expect(AZURE_OPENAI_PROVIDER_DEFINITION).not.toHaveProperty('wellKnownProviderId');
  });
});

describe('buildAzureCompletionsPath', () => {
  it('composes the deployment-scoped path with api-version', () => {
    expect(buildAzureCompletionsPath('my-deployment', '2024-10-21')).toBe(
      '/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21',
    );
  });

  it('URL-encodes deployment names with special characters', () => {
    expect(buildAzureCompletionsPath('my deployment/v1', '2024-10-21')).toBe(
      '/openai/deployments/my%20deployment%2Fv1/chat/completions?api-version=2024-10-21',
    );
  });
});

describe('Azure OpenAI provider — factory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_VERSION;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_VERSION;
    delete process.env.OPENAI_API_KEY;
  });

  it('throws PROVIDER_AUTH_FAILED when no API key is available', () => {
    expect(() => providerFactory.create(MOCK_CONFIG)).toThrow(NousError);
    try {
      providerFactory.create(MOCK_CONFIG);
    } catch (e) {
      expect((e as NousError).code).toBe('PROVIDER_AUTH_FAILED');
    }
  });

  it('never falls back to OPENAI_API_KEY when no Azure key is supplied', () => {
    process.env.OPENAI_API_KEY = 'openai-secret-should-not-leak-to-azure';
    expect(() => providerFactory.create(MOCK_CONFIG)).toThrow(NousError);
  });

  it('creates a ChatCompletionsProvider instance when an API key is supplied', () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('resolves the API key from AZURE_OPENAI_API_KEY when no option is passed', () => {
    process.env.AZURE_OPENAI_API_KEY = 'env-azure-key';
    expect(() => providerFactory.create(MOCK_CONFIG)).not.toThrow();
  });

  it('invoke() validates input — rejects invalid shape with ValidationError', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { invalid: 'shape' },
        traceId: TRACE_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() targets the deployment-scoped Azure path with the default api-version', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    } as Response);

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://acme-resource.openai.azure.com/openai/deployments/my-gpt4o-deployment/chat/completions?api-version=2024-10-21',
    );
    expect(url).not.toContain('/v1/chat/completions');
  });

  it('invoke() honors AZURE_OPENAI_API_VERSION when set', async () => {
    process.env.AZURE_OPENAI_API_VERSION = '2025-01-01-preview';
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], usage: {} }),
    } as Response);

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api-version=2025-01-01-preview');
  });

  it('invoke() sends the key as a raw api-key header, not Authorization Bearer', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], usage: {} }),
    } as Response);

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-azure-key');
    expect(headers.Authorization).toBeUndefined();
  });

  it('invoke() with valid prompt returns a ModelResponse', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from Azure OpenAI' } }],
        usage: { prompt_tokens: 4, completion_tokens: 5 },
      }),
    } as Response);

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Say hello' },
      traceId: TRACE_ID,
    });

    expect(result.output).toBe('Hello from Azure OpenAI');
    expect(result.providerId).toBe(MOCK_CONFIG.id);
    expect(result.usage?.inputTokens).toBe(4);
    expect(result.usage?.outputTokens).toBe(5);
  });

  it('invoke() maps a 401 response to PROVIDER_AUTH_FAILED', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'bad-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('invoke() maps a 429 response to PROVIDER_UNAVAILABLE', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('invoke() throws PROVIDER_UNAVAILABLE on a non-ok response', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('stream() yields content chunks and a final done chunk via the deployment-scoped path', async () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-azure-key' });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          [
            'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{"content":" Azure"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        ));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Say hello' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.content === 'Hello')).toBe(true);
    expect(chunks.some((c) => c.content === ' Azure')).toBe(true);
    expect(chunks.some((c) => c.done === true)).toBe(true);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://acme-resource.openai.azure.com/openai/deployments/my-gpt4o-deployment/chat/completions?api-version=2024-10-21',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-azure-key');
  });
});
