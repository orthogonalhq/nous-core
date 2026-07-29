import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

/**
 * Azure OpenAI provider definition — certified leaf metadata.
 *
 * Scope (narrowed per #304, comment 2026-07-08): this leaf is a direct
 * user-supplied ("BYOK") data-plane connector only. It assumes the user
 * already has an Azure OpenAI resource and a model deployment, and that they
 * provide the resource endpoint, an API key, and the deployment name (used
 * as `modelId`/`defaultModelId` below — Azure routes chat completions by
 * deployment name, not by model name).
 *
 * Deliberately out of scope for this leaf: Azure AI Foundry project
 * management, deployment creation, Microsoft Entra ID / managed-identity
 * auth, quota or capacity discovery, regional routing, provider fallback, or
 * managed Nue Cloud billing/routing. Those broader managed-platform concerns
 * belong to the managed inference relay work tracked in #421. Because the
 * user names their own deployment, there is no public "list my deployments"
 * discovery surface in scope here, so `modelListEndpoint` is intentionally
 * not declared (mirroring how `perplexity` opts out of discovery).
 *
 * Azure OpenAI speaks the OpenAI Chat Completions wire format (same request
 * and response JSON shape), so this leaf reuses the shared
 * `ChatCompletionsProvider`. Two things differ from a stock OpenAI-compatible
 * vendor and are handled in `provider.ts`:
 *  - Path composition: Azure requires
 *    `/openai/deployments/{deploymentName}/chat/completions?api-version=...`
 *    instead of `/v1/chat/completions`. The deployment name comes from
 *    `config.modelId` and is composed into `completionsPath` per request
 *    construction (the shared provider already treats `completionsPath` as
 *    an opaque literal suffix, so no shared-code change was needed for this
 *    part — see `perplexity`'s static override for the existing precedent).
 *  - Credential header: Azure expects a raw `api-key: <key>` header, not
 *    `Authorization: Bearer <key>`. The shared `ChatCompletionsProvider` only
 *    supported the Authorization/bearer shape, so it now accepts
 *    `authHeaderName`/`authHeaderScheme` options (default unchanged) rather
 *    than duplicating request/response handling in this leaf.
 *
 * Definitions stay metadata only: no environment reads, network calls, or
 * concrete provider instantiation, and no hand-authored
 * `wellKnownProviderId` (the built-in id is derived centrally from
 * `vendorKey`).
 */
export const AZURE_OPENAI_DEFAULT_ENDPOINT = 'https://your-resource.openai.azure.com';
export const AZURE_OPENAI_DEFAULT_MODEL_ID = 'gpt-4o';

export const AZURE_OPENAI_PROVIDER_DEFINITION = {
  vendorKey: 'azure-openai',
  displayName: 'Azure OpenAI',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  // Placeholder — every Azure OpenAI resource has a unique endpoint. The user
  // must replace this with their own `https://<resource>.openai.azure.com`.
  defaultEndpoint: AZURE_OPENAI_DEFAULT_ENDPOINT,
  // Placeholder — this is the user's Azure *deployment* name, not a model
  // family id. The user must replace this with their own deployment name.
  defaultModelId: AZURE_OPENAI_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'AZURE_OPENAI_API_KEY',
    vaultKeyNamespace: 'azure-openai',
    header: {
      name: 'api-key',
      scheme: 'raw',
    },
    required: true,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
    nativeToolUse: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { AZURE_OPENAI_PROVIDER_DEFINITION as providerDefinition };
