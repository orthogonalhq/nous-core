import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

/**
 * OpenAI-compatible base for DashScope international.
 * Deliberately omits Alibaba's `/v1` suffix — `ChatCompletionsProvider`
 * appends `/v1/chat/completions` and `/v1/models` itself (xAI shipped a
 * doubled-`/v1` bug with a `/v1` base; fixed in a4dc1950).
 * China region: `https://dashscope.aliyuncs.com/compatible-mode`.
 * Workspace-scoped hosts also exist — override `defaultEndpoint` when needed.
 */
export const DASHSCOPE_DEFAULT_ENDPOINT =
  'https://dashscope-intl.aliyuncs.com/compatible-mode';
export const DASHSCOPE_DEFAULT_MODEL_ID = 'qwen-plus';

/**
 * DashScope (Alibaba Model Studio / Qwen) exposes an OpenAI Chat
 * Completions-compatible API, so this leaf carries only DashScope-specific
 * metadata and reuses the shared `ChatCompletionsProvider`.
 * `defaultEndpoint` is the OpenAI-compatible base.
 * The shared provider appends `/v1/chat/completions` and `/v1/models`.
 */
export const DASHSCOPE_PROVIDER_DEFINITION = {
  vendorKey: 'dashscope',
  displayName: 'DashScope (Qwen)',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: DASHSCOPE_DEFAULT_ENDPOINT,
  defaultModelId: DASHSCOPE_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'DASHSCOPE_API_KEY',
    vaultKeyNamespace: 'dashscope',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  modelListFormat: 'openai-models',
  // `/v1/models` requires auth (401 without a key), so key validation can use
  // `modelListEndpoint` — no separate `healthCheckEndpoint`.
  capabilities: {
    streaming: true,
    modelListing: true,
    // `nativeToolUse` is intentionally omitted: per #390 a provider must not
    // advertise it until the shared native tool-use bridge supports the full
    // request/tool-call/tool-result loop.
  },
  isLocal: false,
  // Built-in provider ids are derived centrally from `vendorKey` by
  // `provider-identity.ts` and hydrated into the catalog.
} as const satisfies ProviderDefinitionLeaf;

export {
  DASHSCOPE_PROVIDER_DEFINITION as providerDefinition,
};
