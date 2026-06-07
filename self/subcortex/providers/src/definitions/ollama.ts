import { defineProvider } from './types.js';
import type { ProviderId } from '@nous/shared';

export const OLLAMA_PROVIDER_DEFINITION = defineProvider({
  vendorKey: 'ollama',
  displayName: 'Ollama',
  wellKnownProviderId: '10000000-0000-0000-0000-000000000003' as ProviderId,
  providerType: 'text',
  providerClass: 'local_text',
  protocol: 'ollama',
  adapterKey: 'ollama',
  defaultEndpoint: 'http://localhost:11434',
  defaultModelId: 'llama3.2',
  auth: {
    required: false,
    purpose: 'api_key',
  },
  modelListEndpoint: '/api/tags',
  healthCheckEndpoint: '/api/tags',
  capabilities: {
    streaming: true,
    extendedThinking: true,
    nativeToolUse: true,
    modelListing: true,
    healthCheck: true,
  },
  isLocal: true,
});
