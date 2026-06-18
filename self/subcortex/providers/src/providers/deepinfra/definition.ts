import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const DEEPINFRA_PROVIDER_DEFINITION = {
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
  capabilities: {
    streaming: true,
    nativeToolUse: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { DEEPINFRA_PROVIDER_DEFINITION as providerDefinition };