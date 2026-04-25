/**
 * Health tRPC router.
 */
import { z } from 'zod';
import {
  StatusBarSnapshotSchema,
  type StatusBarBackpressure,
  type StatusBarBudget,
  type StatusBarActiveAgents,
  type StatusBarCognitiveProfile,
} from '@nous/shared';
import type { NousContext } from '../../context';
import { router, publicProcedure } from '../trpc';
import { getOllamaEndpointFromContext } from '../../ollama-config';

// WR-162 SP 11 (SUPV-SP11-011) — file-scope private helpers. NOT exported.
// Per SDS-N3 closure (approach a): import the existing `NousContext` type
// from '../../context'. Phase 0 Task 0c verified the type is exportable.
// The helpers consume only a subset of `NousContext` fields, but the type
// is shared with the procedure body so no cast is needed at the call site.

async function safeBackpressure(
  ctx: NousContext,
): Promise<StatusBarBackpressure | null> {
  try {
    const systemStatus = ctx.healthAggregator.getSystemStatus();
    const supervisorSnap = await ctx.supervisorService.getStatusSnapshot();
    const queueDepth = systemStatus.backlogAnalytics.queuedCount;
    const activeAgents = supervisorSnap.agentsMonitored;
    // Field-name verified at code-time against `SystemStatusSnapshotSchema`:
    // `pressureTrend` enum is `'increasing' | 'stable' | 'decreasing'` (NOT
    // `'rising'`). Map `'increasing'` to the elevated branch.
    const state: StatusBarBackpressure['state'] =
      supervisorSnap.activeViolationCounts.s0 > 0
        ? 'critical'
        : supervisorSnap.activeViolationCounts.s1 > 0 ||
            systemStatus.backlogAnalytics.pressureTrend === 'increasing'
          ? 'elevated'
          : 'nominal';
    return { state, queueDepth, activeAgents };
  } catch {
    return null;
  }
}

// SUPV-SP11-013 — Decision #7 Option D.2: server-side cognitive-profile reads
// are forbidden in V1. Return `null` unconditionally. Signature accepts both
// arguments for forward compatibility but the body does not read either.
async function safeCognitiveProfile(
  _ctx: NousContext,
  _projectId: string | undefined,
): Promise<StatusBarCognitiveProfile | null> {
  return null;
}

async function safeBudget(
  ctx: NousContext,
  projectId: string | undefined,
): Promise<StatusBarBudget | null> {
  try {
    if (!projectId) return null;
    const budget = ctx.costGovernanceService.getBudgetStatus(projectId);
    if (!budget.hasBudget) return null;
    const ratio = budget.utilizationPercent / 100;
    const state: StatusBarBudget['state'] = budget.hardCeilingFired
      ? 'exceeded'
      : budget.softAlertFired
        ? 'caution'
        : ratio >= 0.75
          ? 'warning'
          : 'nominal';
    return {
      state,
      spent: budget.currentSpendUsd,
      ceiling: budget.budgetCeilingUsd,
      period: budget.periodStart,
    };
  } catch {
    return null;
  }
}

async function safeActiveAgents(
  ctx: NousContext,
): Promise<StatusBarActiveAgents | null> {
  try {
    const mao = await ctx.maoProjectionService.getSystemSnapshot({ densityMode: 'D2' });
    const count = mao.agents.length;
    const status: StatusBarActiveAgents['status'] = count > 0 ? 'active' : 'idle';
    return { count, status };
  } catch {
    return null;
  }
}

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

  // WR-162 SP 11 (SUPV-SP11-016) — status-bar aggregator. Composes the four
  // `safe*` helpers into the typed aggregate. Throws only when ALL FOUR slots
  // return null (Decision #4 Failure Isolation Rule). Three-of-four null is
  // acceptable; four-of-four is the aggregator-broken signal SP 12 needs
  // to render an error state.
  getStatusBarSnapshot: publicProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .output(StatusBarSnapshotSchema)
    .query(async ({ ctx, input }) => {
      const backpressure = await safeBackpressure(ctx);
      const cognitiveProfile = await safeCognitiveProfile(ctx, input.projectId);
      const budget = await safeBudget(ctx, input.projectId);
      const activeAgents = await safeActiveAgents(ctx);
      if (
        backpressure === null &&
        cognitiveProfile === null &&
        budget === null &&
        activeAgents === null
      ) {
        throw new Error('status-bar aggregator: all four slots returned null');
      }
      return { backpressure, cognitiveProfile, budget, activeAgents };
    }),
});
