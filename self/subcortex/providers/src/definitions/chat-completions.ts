import { defineProvider } from './types.js';
import type { ProviderId } from '@nous/shared';

export const CHAT_COMPLETIONS_PROVIDER_DEFINITION = defineProvider({
  vendorKey: 'openai',
  displayName: 'Chat Completions',
  wellKnownProviderId: '10000000-0000-0000-0000-000000000002' as ProviderId,
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: 'https://api.openai.com',
  defaultModelId: 'gpt-4o',
  auth: {
    envVar: 'OPENAI_API_KEY',
    vaultKeyNamespace: 'openai',
    required: true,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  capabilities: {
    streaming: true,
    nativeToolUse: true,
  },
  isLocal: false,
});
