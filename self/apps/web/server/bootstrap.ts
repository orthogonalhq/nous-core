/**
 * Bootstrap — wires the Nous stack for the web app.
 *
 * Thin adapter over @nous/shared-server. The platform-agnostic service graph
 * lives in shared-server; this file adds web-specific caching and env wiring.
 */
import {
  createNousServices,
  loadStoredApiKeys,
  registerStoredProviders,
  WELL_KNOWN_PROVIDER_IDS,
} from '@nous/shared-server';
import type { NousContext } from '@nous/shared-server';

export type { NousContext };

let cachedContext: NousContext | null = null;
let initPromise: Promise<NousContext> | null = null;

export function clearNousContextCache(): void {
  cachedContext = null;
  initPromise = null;
}

export function createNousContext(): NousContext {
  if (cachedContext) {
    return cachedContext;
  }

  cachedContext = createNousServices({
    runtimeLabel: 'web',
  });

  return cachedContext;
}

export async function initializeNousContext(): Promise<NousContext> {
  if (initPromise) {
    return initPromise;
  }

  const ctx = createNousContext();
  initPromise = (async () => {
    await loadStoredApiKeys(ctx);
    await registerStoredProviders(ctx);

    // Recompose harness after providers are registered. createNousServices runs
    // attachProviders before providers exist, so the harness defaults to 'text'.
    for (const agentClass of ['Cortex::Principal', 'Cortex::System'] as const) {
      const provider = ctx.providerRegistry.getProvider(
        WELL_KNOWN_PROVIDER_IDS.anthropic,
      );
      const vendor = provider?.getConfig().vendor;
      if (vendor) {
        ctx.gatewayRuntime.recomposeHarnessForClass(agentClass, vendor);
      }
    }

    return ctx;
  })();

  return initPromise;
}
