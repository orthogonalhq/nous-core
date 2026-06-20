import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

const DEFAULT_ENDPOINT = 'https://api.moonshot.ai';
const DEFAULT_MODEL_ID = 'kimi-k2.6';

export const MOONSHOT_PROVIDER_DEFINITION = {
  vendorKey: 'moonshot',
  displayName: 'Moonshot Kimi',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: DEFAULT_ENDPOINT,
  defaultModelId: DEFAULT_MODEL_ID,
  auth: {
    envVar: 'MOONSHOT_API_KEY',
    vaultKeyNamespace: 'moonshot',
    required: true,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  capabilities: {
    streaming: true,
    nativeToolUse: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { MOONSHOT_PROVIDER_DEFINITION as providerDefinition };
