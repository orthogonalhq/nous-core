import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const LLAMA_CPP_PROVIDER_DEFINITION = {
  vendorKey: 'llama-cpp',
  displayName: 'llama.cpp',
  providerType: 'text',
  providerClass: 'local_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: 'http://localhost:8080',
  defaultModelId: 'llama3.2',
  auth: {
    required: false,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  modelListFormat: 'openai-models',
  healthCheckEndpoint: '/v1/models',
  capabilities: {
    streaming: true,
    nativeToolUse: true,
    modelListing: true,
    healthCheck: true,
  },
  isLocal: true,
} as const satisfies ProviderDefinitionLeaf;

export { LLAMA_CPP_PROVIDER_DEFINITION as providerDefinition };
