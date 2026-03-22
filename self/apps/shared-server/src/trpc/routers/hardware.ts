/**
 * Hardware detection tRPC router.
 */
import type { NousContext } from '../../context';
import {
  detectHardware,
  recommendModels,
  type RecommendationProfilePolicy,
} from '../../hardware-detection';
import { router, publicProcedure } from '../trpc';

function getProfilePolicy(ctx: NousContext): RecommendationProfilePolicy {
  const config = ctx.config.get() as {
    profile?: RecommendationProfilePolicy;
  };

  return config.profile ?? {
    name: 'local-only',
    allowLocalProviders: true,
    allowRemoteProviders: false,
  };
}

export const hardwareRouter = router({
  getSpec: publicProcedure.query(async () => {
    return detectHardware();
  }),

  getRecommendations: publicProcedure.query(async ({ ctx }) => {
    const hardware = await detectHardware();
    return recommendModels(hardware, getProfilePolicy(ctx));
  }),
});
