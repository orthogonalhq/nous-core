import { describe, expect, it } from 'vitest';
import type { TraceId } from '@nous/shared';
import { PROVIDER_DEFINITIONS, resolveProviderDefinition } from '../../provider-definitions.js';
import { ADAPTER_RESOLVER } from '../../adapter-resolver.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440000' as TraceId;

describe('DeepInfra provider leaf', () => {
  const definition = resolveProviderDefinition('deepinfra');

  describe('definition', () => {
    it('is present in PROVIDER_DEFINITIONS', () => {
      expect(PROVIDER_DEFINITIONS.find((d) => d.vendorKey === 'deepinfra')).toBeDefined();
    });

    it('validates through ProviderDefinitionSchema', () => {
      expect(() => ProviderDefinitionSchema.parse(definition)).not.toThrow();
    });

    it('has correct vendor metadata', () => {
      expect(definition.vendorKey).toBe('deepinfra');
      expect(definition.displayName).toBe('DeepInfra');
      expect(definition.providerType).toBe('text');
      expect(definition.isLocal).toBe(false);
    });

    it('uses the chat-completions adapter and protocol', () => {
      expect(definition.adapterKey).toBe('chat-completions');
      expect(definition.protocol).toBe('chat-completions');
    });

    it('points to the DeepInfra OpenAI-compatible endpoint', () => {
      expect(definition.defaultEndpoint).toBe('https://api.deepinfra.com/v1/openai');
    });

    it('requires an API key via DEEPINFRA_API_KEY', () => {
      expect(definition.auth.required).toBe(true);
      expect('envVar' in definition.auth && definition.auth.envVar).toBe('DEEPINFRA_API_KEY');
    });

    it('does not hand-author wellKnownProviderId', () => {
      const rawDefinition = {
        vendorKey: 'deepinfra',
        displayName: 'DeepInfra',
        providerType: 'text',
        providerClass: 'remote_text',
        protocol: 'chat-completions',
        adapterKey: 'chat-completions',
        defaultEndpoint: 'https://api.deepinfra.com/v1/openai',
        defaultModelId: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        auth: {
          envVar: 'DEEPINFRA_API_KEY',
          vaultKeyNamespace: 'deepinfra',
          required: true,
          purpose: 'api_key',
        },
        modelListEndpoint: '/models',
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
      const output = { choices: [{ message: { content: 'DeepInfra response' } }] };
      const parsed = adapter.parseResponse(output, TRACE_ID);
      expect(parsed.response).toBe('DeepInfra response');
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