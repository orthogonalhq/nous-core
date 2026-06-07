import { defineProvider } from './types.js';
import type { ProviderId } from '@nous/shared';

export const ANTHROPIC_PROVIDER_DEFINITION = defineProvider({
  vendorKey: 'anthropic',
  displayName: 'Anthropic',
  wellKnownProviderId: '10000000-0000-0000-0000-000000000001' as ProviderId,
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'anthropic-messages',
  adapterKey: 'anthropic',
  defaultEndpoint: 'https://api.anthropic.com',
  defaultModelId: 'claude-sonnet-4-20250514',
  auth: {
    envVar: 'ANTHROPIC_API_KEY',
    vaultKeyNamespace: 'anthropic',
    required: true,
    purpose: 'api_key',
  },
  headers: {
    'anthropic-version': '2023-06-01',
  },
  capabilities: {
    streaming: true,
    cacheControl: true,
    extendedThinking: true,
    nativeToolUse: true,
  },
  isLocal: false,
});
