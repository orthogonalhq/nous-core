import { NousError } from '@nous/shared';
import type { ModelProviderConfig } from '@nous/shared';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type {
  ProviderFactoryCreateOptions,
  ProviderFactoryModule,
} from '../../schemas/provider-factory.js';
import { AZURE_OPENAI_PROVIDER_DEFINITION } from './definition.js';

const AZURE_OPENAI_ENV_VAR = AZURE_OPENAI_PROVIDER_DEFINITION.auth.envVar!;
const AZURE_OPENAI_HEADER = AZURE_OPENAI_PROVIDER_DEFINITION.auth.header!;

// Azure OpenAI's stable GA api-version. Overridable per-deployment via
// `AZURE_OPENAI_API_VERSION` since Azure ships new api-versions on its own
// cadence and a resource's supported versions can vary.
const DEFAULT_API_VERSION = '2024-10-21';

/**
 * Builds the Azure `/openai/deployments/{deployment}/chat/completions`
 * completions path for a given deployment name and api-version.
 *
 * Azure routes chat completions by *deployment name*, not by model family,
 * so the deployment name is the leaf's `config.modelId` — the user names
 * their own deployment. This is composed per-instance (rather than as a
 * static `completionsPath`, as `perplexity` uses) because the deployment
 * name is only known once a config is constructed, not at definition time.
 */
export function buildAzureCompletionsPath(deploymentName: string, apiVersion: string): string {
  const encodedDeployment = encodeURIComponent(deploymentName);
  const encodedVersion = encodeURIComponent(apiVersion);
  return `/openai/deployments/${encodedDeployment}/chat/completions?api-version=${encodedVersion}`;
}

export const providerFactory = {
  vendorKey: 'azure-openai',
  create(config: ModelProviderConfig, options?: ProviderFactoryCreateOptions) {
    // Fail closed against the shared provider's OpenAI fallback.
    // `ChatCompletionsProvider` falls back to `process.env.OPENAI_API_KEY`
    // when no key is supplied, which could send an OpenAI credential to the
    // user's Azure resource. Resolve the Azure key explicitly and refuse to
    // construct without it.
    const apiKey = options?.apiKey ?? process.env[AZURE_OPENAI_ENV_VAR];
    if (!apiKey) {
      throw new NousError(
        'Azure OpenAI API key required — set AZURE_OPENAI_API_KEY or pass the apiKey option',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_API_VERSION;
    // `config.modelId` is the Azure deployment name, per the leaf's narrowed
    // BYOK scope (see definition.ts).
    const completionsPath = buildAzureCompletionsPath(config.modelId, apiVersion);

    return new ChatCompletionsProvider(config, {
      apiKey,
      completionsPath,
      authHeaderName: AZURE_OPENAI_HEADER.name,
      authHeaderScheme: AZURE_OPENAI_HEADER.scheme,
    });
  },
} as const satisfies ProviderFactoryModule;
