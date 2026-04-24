/**
 * WR-162 SP 6 — Supervisor tRPC router.
 *
 * Three `publicProcedure` queries per
 * `.architecture/.decisions/2026-04-14-system-observability-and-control/supervisor-trpc-procedure-set-v1.md`:
 * - `getRecentViolations({ projectId?, limit?, since? })` — paginated violation feed.
 * - `getSupervisorStatus()` — aggregate supervisor status snapshot.
 * - `getSentinelRiskScores({ projectId? })` — per-project sentinel risk scores.
 *
 * All queries pass through to `ctx.supervisorService`, which is a required
 * field on `NousContext` (SUPV-SP6-006). The SUPV-SP3-002 gate at the
 * service internals is the single source of truth — no `if (ctx.supervisorService)`
 * branch here (defensive double-gating banned per
 * `feedback_no_heuristic_bandaids.md`).
 *
 * V1 posture: queries only. Mutations deferred to V2 per Decision #10.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const supervisorRouter = router({
  getRecentViolations: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(200).default(50),
        since: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      ctx.supervisorService.getRecentViolations(input),
    ),

  getSupervisorStatus: publicProcedure.query(async ({ ctx }) =>
    ctx.supervisorService.getStatusSnapshot(),
  ),

  getSentinelRiskScores: publicProcedure
    .input(z.object({ projectId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) =>
      ctx.supervisorService.getSentinelRiskScores(input),
    ),
});
