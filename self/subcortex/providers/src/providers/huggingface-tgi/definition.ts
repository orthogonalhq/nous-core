import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const providerDefinition = {
  vendorKey: 'huggingface-tgi',
  displayName: 'HuggingFace',
  providerType: 'text',
  defaultModelId: 'gpt-5.4',
  providerClass: 'local_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: 'http://localhost:8080',
  auth: {
    envVar: 'HUGGINGFACE_API_KEY',
    vaultKeyNamespace: 'huggingface',
    required: false,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
  },
  isLocal: true,
} as const satisfies ProviderDefinitionLeaf;
