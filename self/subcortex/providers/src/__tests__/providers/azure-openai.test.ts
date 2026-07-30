import { describe, expect, it } from 'vitest';
import type { TraceId } from '@nous/shared';
import { PROVIDER_DEFINITIONS, resolveProviderDefinition } from '../../provider-definitions.js';
import { ADAPTER_RESOLVER } from '../../adapter-resolver.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440000' as TraceId;

describe('Azure OpenAI provider leaf', () => {
  const definition = resolveProviderDefinition('azure-openai');

  describe('definition', () => {
    it('is present in PROVIDER_DEFINITIONS', () => {
      expect(PROVIDER_DEFINITIONS.find((d) => d.vendorKey === 'azure-openai')).toBeDefined();
    });

    it('validates through ProviderDefinitionSchema', () => {
      expect(() => ProviderDefinitionSchema.parse(definition)).not.toThrow();
    });

    it('has correct vendor metadata', () => {
      expect(definition.vendorKey).toBe('azure-openai');
      expect(definition.displayName).toBe('Azure OpenAI');
      expect(definition.providerType).toBe('text');
      expect(definition.isLocal).toBe(false);
    });

    it('uses the chat-completions adapter and protocol', () => {
      expect(definition.adapterKey).toBe('chat-completions');
      expect(definition.protocol).toBe('chat-completions');
    });

    it('requires an API key via AZURE_OPENAI_API_KEY with a raw api-key header', () => {
      expect(definition.auth.required).toBe(true);
      expect('envVar' in definition.auth && definition.auth.envVar).toBe('AZURE_OPENAI_API_KEY');
      expect(definition.auth.header).toEqual({ name: 'api-key', scheme: 'raw' });
    });

    it('does not hand-author wellKnownProviderId', () => {
      const rawDefinition = {
        vendorKey: 'azure-openai',
        displayName: 'Azure OpenAI',
        providerType: 'text',
        providerClass: 'remote_text',
        protocol: 'chat-completions',
        adapterKey: 'chat-completions',
        defaultEndpoint: 'https://your-resource.openai.azure.com',
        defaultModelId: 'gpt-4o',
        auth: {
          envVar: 'AZURE_OPENAI_API_KEY',
          vaultKeyNamespace: 'azure-openai',
          header: { name: 'api-key', scheme: 'raw' },
          required: true,
          purpose: 'api_key',
        },
        capabilities: { streaming: true, nativeToolUse: true },
        isLocal: false,
      };
      expect(Object.keys(rawDefinition)).not.toContain('wellKnownProviderId');
    });
  });

  describe('adapter', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter('chat-completions');

    it('resolves to the chat-completions adapter', () => {
      expect(ADAPTER_RESOLVER.resolveModule(definition.adapterKey).adapterKey).toBe('chat-completions');
    });

    it('parses a standard chat completions response', () => {
      const output = { choices: [{ message: { content: 'Azure OpenAI response' } }] };
      const parsed = adapter.parseResponse(output, TRACE_ID);
      expect(parsed.response).toBe('Azure OpenAI response');
      expect(parsed.toolCalls).toEqual([]);
      expect(parsed.contentType).toBe('text');
    });

    it('parses tool calls from a chat completions response', () => {
      const output = {
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: { name: 'my_tool', arguments: '{"param":"value"}' },
            }],
          },
        }],
      };
      const parsed = adapter.parseResponse(output, TRACE_ID);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0].name).toBe('my_tool');
    });

    it('returns a text fallback instead of throwing on malformed output', () => {
      expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
      expect(adapter.parseResponse(null, TRACE_ID).contentType).toBe('text');
      expect(adapter.parseResponse(undefined, TRACE_ID).contentType).toBe('text');
    });
  });
});
