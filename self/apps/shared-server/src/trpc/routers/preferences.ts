/**
 * Preferences tRPC router — API key management and system status.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

const SYSTEM_APP_ID = 'nous:system';

const ProviderSchema = z.enum(['anthropic', 'openai']);
type Provider = z.infer<typeof ProviderSchema>;

const PROVIDER_CONFIG: Record<
  Provider,
  {
    envVar: string;
    targetHost: string;
    injectionKey: string;
  }
> = {
  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    targetHost: 'api.anthropic.com',
    injectionKey: 'x-api-key',
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    targetHost: 'api.openai.com',
    injectionKey: 'Authorization',
  },
};

function vaultKey(provider: Provider): string {
  return `api_key_${provider}`;
}

function maskApiKey(key: string): string {
  if (key.length <= 11) {
    return key.slice(0, 3) + '...' + key.slice(-4);
  }
  return key.slice(0, 7) + '...' + key.slice(-4);
}

export const preferencesRouter = router({
  getApiKeys: publicProcedure.query(async ({ ctx }) => {
    const providers: Provider[] = ['anthropic', 'openai'];
    const results: Array<{
      provider: Provider;
      configured: boolean;
      maskedKey: string | null;
      createdAt: string | null;
    }> = [];

    for (const provider of providers) {
      const metadata = await ctx.credentialVaultService.getMetadata(
        SYSTEM_APP_ID,
        vaultKey(provider),
      );

      if (metadata) {
        // Resolve the secret to produce a masked value
        const resolved = await ctx.credentialVaultService.resolveForInjection(
          SYSTEM_APP_ID,
          vaultKey(provider),
        );

        results.push({
          provider,
          configured: true,
          maskedKey: resolved ? maskApiKey(resolved.secretValue) : null,
          createdAt: metadata.created_at,
        });
      } else {
        results.push({
          provider,
          configured: false,
          maskedKey: null,
          createdAt: null,
        });
      }
    }

    return results;
  }),

  setApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
        key: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = PROVIDER_CONFIG[input.provider];

      await ctx.credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey(input.provider),
        value: input.key,
        credential_type: 'api_key',
        target_host: config.targetHost,
        injection_location: 'header',
        injection_key: config.injectionKey,
      });

      // Set in process environment for immediate SDK access
      process.env[config.envVar] = input.key;

      return { stored: true };
    }),

  deleteApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = PROVIDER_CONFIG[input.provider];

      const result = await ctx.credentialVaultService.revoke(SYSTEM_APP_ID, {
        key: vaultKey(input.provider),
        reason: 'user_deleted',
      });

      // Clear from process environment
      delete process.env[config.envVar];

      return { deleted: result.revoked };
    }),

  testApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
        key: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        if (input.provider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
              'x-api-key': input.key,
              'anthropic-version': '2023-06-01',
            },
          });
          if (response.ok) {
            return { valid: true, error: null };
          }
          const body = await response.text();
          return { valid: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        if (input.provider === 'openai') {
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${input.key}`,
            },
          });
          if (response.ok) {
            return { valid: true, error: null };
          }
          const body = await response.text();
          return { valid: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        return { valid: false, error: `Unknown provider: ${input.provider}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, error: message };
      }
    }),

  getSystemStatus: publicProcedure.query(async ({ ctx }) => {
    // Determine which providers are configured
    const providers: Provider[] = ['anthropic', 'openai'];
    const configuredProviders: string[] = [];

    for (const provider of providers) {
      const metadata = await ctx.credentialVaultService.getMetadata(
        SYSTEM_APP_ID,
        vaultKey(provider),
      );
      if (metadata) {
        configuredProviders.push(provider);
      }
    }

    // Check Ollama status
    let ollamaRunning = false;
    let ollamaModels: string[] = [];
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ollamaRunning = true;
        const body = (await response.json()) as { models?: Array<{ name: string }> };
        ollamaModels = body.models?.map((m) => m.name) ?? [];
      }
    } catch {
      // Ollama not reachable
    }

    return {
      ollama: {
        running: ollamaRunning,
        models: ollamaModels,
      },
      configuredProviders,
      credentialVaultHealthy: true,
    };
  }),
});
