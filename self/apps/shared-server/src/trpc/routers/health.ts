/**
 * Health tRPC router.
 */
import { router, publicProcedure } from '../trpc';
import { getOllamaEndpointFromContext } from '../../ollama-config';

export const healthRouter = router({
  check: publicProcedure.query(async ({ ctx }) => {
    const components: Array<{ name: string; status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> = [];
    const now = new Date().toISOString();

    try {
      await ctx.documentStore.query('projects', { limit: 1 });
      components.push({ name: 'storage', status: 'healthy' });
    } catch {
      components.push({
        name: 'storage',
        status: 'unhealthy',
        message: 'Document store check failed',
      });
    }

    const config = ctx.config.get() as { providers?: Array<{ endpoint?: string; isLocal?: boolean }> };
    const providers = config.providers ?? [];
    const hasLocal = providers.some((p) => p.isLocal);
    if (hasLocal) {
      try {
        const ollamaEndpoint = getOllamaEndpointFromContext(ctx);
        console.log('[nous:health] ollama probe:', ollamaEndpoint);
        const res = await fetch(`${ollamaEndpoint}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });
        components.push({
          name: 'ollama',
          status: res.ok ? 'healthy' : 'degraded',
          message: res.ok ? undefined : `HTTP ${res.status}`,
        });
      } catch {
        components.push({
          name: 'ollama',
          status: 'unhealthy',
          message: 'Ollama not reachable',
        });
      }
    } else {
      components.push({
        name: 'ollama',
        status: 'healthy',
        message: 'No local providers configured',
      });
    }

    const healthy = components.every((c) => c.status === 'healthy');
    return {
      healthy,
      components,
      timestamp: now,
    };
  }),

  systemStatus: publicProcedure.query(({ ctx }) => {
    return ctx.healthAggregator.getSystemStatus();
  }),

  providerHealth: publicProcedure.query(({ ctx }) => {
    return ctx.healthAggregator.getProviderHealth();
  }),

  agentStatus: publicProcedure.query(({ ctx }) => {
    return ctx.healthAggregator.getAgentStatus();
  }),
});
