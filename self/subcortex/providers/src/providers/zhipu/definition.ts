// Zhipu GLM — OpenAI Chat Completions-compatible leaf (z.ai `paas/v4` surface).
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

// The z.ai base already carries the `/api/paas/v4` version segment, so the
// factory overrides the shared `/v1/chat/completions` default (see provider.ts).
const DEFAULT_ENDPOINT = 'https://api.z.ai/api/paas/v4';
const DEFAULT_MODEL_ID = 'glm-4.6';

export const ZHIPU_PROVIDER_DEFINITION = {
  vendorKey: 'zhipu',
  displayName: 'Zhipu GLM',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: DEFAULT_ENDPOINT,
  defaultModelId: DEFAULT_MODEL_ID,
  auth: {
    envVar: 'ZHIPU_API_KEY',
    vaultKeyNamespace: 'zhipu',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  // Zhipu exposes no public model-list endpoint, so discovery is omitted and the
  // runtime falls back to defaultModelId. GLM supports streaming. Z.AI supports
  // native function calling upstream, but Nous's shared Chat Completions path can't
  // complete that tool-call round trip yet (#390), so nativeToolUse is omitted.
  capabilities: {
    streaming: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { ZHIPU_PROVIDER_DEFINITION as providerDefinition };
