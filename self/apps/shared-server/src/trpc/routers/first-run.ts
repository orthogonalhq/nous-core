/**
 * First-run tRPC router.
 */
import { z } from 'zod';
import type { ModelProviderConfig, ProviderId, ProviderVendor } from '@nous/shared';
import {
  PersonalityConfigSchema,
  UserProfileSchema,
} from '@nous/autonomic-config';
import type { NousContext } from '../../context';
import { router, publicProcedure } from '../trpc';
import {
  ValidationStateSchema,
  detectHardware,
  recommendModels,
  type ValidationState,
} from '../../hardware-detection';
import {
  checkRegistryAvailability,
  detectOllama,
  normalizeSpecForLocalLookup,
  pullOllamaModel,
} from '../../ollama-detection';

/**
 * SP 1.5 — registry-availability validation map keyed by `modelSpec`.
 * Returned alongside the `recommendations` payload from
 * `firstRun.checkPrerequisites` so the renderer can render a per-card
 * validation indicator without issuing a second transport call (SDS
 * § 0 Note 4 single-procedure-extension binding).
 */
export const ValidationMapSchema = z.record(z.string(), ValidationStateSchema);
export type ValidationMap = z.infer<typeof ValidationMapSchema>;

/**
 * Build the validation map for a set of recommended Ollama specs.
 *
 * SP 1.8 Fix #7 — cross-axis derivation. For each unique spec:
 *   1. Local axis (preferred — durable signal). Strip the `'ollama:'`
 *      prefix via `normalizeSpecForLocalLookup` and check whether the bare
 *      id is in `locallyInstalledIds` (the `OllamaStatus.models` list).
 *      If yes, short-circuit to `'validated'` WITHOUT invoking
 *      `checkRegistryAvailability` and WITHOUT writing the 30-min session
 *      cache — the local presence is durable signal that registry
 *      unreachability cannot contradict (SP 1.5 Decision 5 graceful
 *      degradation extended).
 *   2. Otherwise fall through to the existing registry-axis HEAD probe.
 *
 * The fan-out is bounded by the recommendation set size (typically 2-4
 * unique specs after dedup); the per-spec session cache inside
 * `checkRegistryAvailability` deduplicates within the TTL window.
 *
 * Trace: SP 1.8 SDS § 4.5 / Goals C7 / C8 / Plan Task #7 / Invariant D
 * (the standalone `validateModelAvailability` procedure remains
 * registry-only and is NOT modified).
 */
export async function buildValidationMap(
  recommendedSpecs: readonly string[],
  locallyInstalledIds: readonly string[],
): Promise<ValidationMap> {
  const uniqueSpecs = Array.from(new Set(recommendedSpecs));
  const localSet = new Set(locallyInstalledIds);
  const states = await Promise.all(
    uniqueSpecs.map(async (spec) => {
      const localId = normalizeSpecForLocalLookup(spec);
      if (localSet.has(localId)) {
        // Local-axis short-circuit — durable signal beats registry.
        // Note: deliberately skips the per-spec registry session cache
        // (`setCachedAvailability`) so a future registry-axis call for
        // the same spec is not pre-poisoned by this local derivation.
        console.info(
          `[nous:first-run] validation: ${spec} -> validated (local)`,
        );
        return [spec, 'validated' as const] as const;
      }
      const state = await checkRegistryAvailability(spec);
      return [spec, state] as const;
    }),
  );
  const result: ValidationMap = {};
  for (const [spec, state] of states) {
    result[spec] = state;
  }
  return result;
}
import {
  FirstRunActionResultSchema,
  FirstRunRoleAssignmentInputSchema,
  FirstRunStepSchema,
  getFirstRunState,
  isFirstRunComplete,
  markFirstRunComplete,
  markStepComplete,
  resetFirstRunState,
} from '../../first-run';
import {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig,
  buildProviderConfig,
  parseSelectedModelSpec,
  updateRoleAssignment,
  upsertProviderConfig,
} from '../../bootstrap';

// SP 1.3 — JSON-serializable identity-step payload for the wizard's
// `WizardStepIdentity` (SP 1.4) submit at sub-stage C completion.
//
// Strict mode (`PersonalityConfigSchema`/`UserProfileSchema` use `.strict()`,
// and the input schema below adds its own `.strict()`) prevents the wizard
// from silently submitting unknown fields. No Date/Map/Set/function values
// — primitives only — per the wizard's `trpc-fetch.ts` raw-fetch transport
// constraint (SDS Invariant I12).
const WriteIdentityInputSchema = z.object({
  name: z.string().min(1).max(120),
  personality: PersonalityConfigSchema,
  profile: UserProfileSchema,
}).strict();

/**
 * SP 1.9 Fix #4 / Fix #5 — resolve the current Principal-class vendor for
 * the harness recompose call following `writeIdentity` / `resetWizard`.
 *
 * Mirrors the registry-lookup idiom at `web/server/bootstrap.ts:50-53`
 * and `desktop/server/main.ts:224-227` — consult the provider registry
 * for the well-known Ollama provider and read `.getConfig().vendor`.
 *
 * Distinct from `preferences.ts:578-580` (which takes vendor from
 * `providerConfig.vendor` constructed by `buildProviderSelection(modelSpec)`
 * — a value-from-selection idiom). `first-run.ts` has no `modelSpec` input
 * at the writeIdentity / resetWizard surfaces, so the registry-lookup
 * idiom is the correct mirror.
 *
 * Graceful-degradation: on any lookup failure, return `'text'`. The
 * `'text'` adapter still produces a valid composed harness (the
 * recompose always runs); the next `attachProviders` /
 * `preferences.setRoleAssignment` call re-syncs to the actual vendor.
 * SDS § 0 Note 10 § "graceful-degradation". Goals risk row 3.
 */
function resolvePrincipalVendor(ctx: NousContext): ProviderVendor {
  try {
    const provider = ctx.getProvider(OLLAMA_WELL_KNOWN_PROVIDER_ID);
    const vendor = provider?.getConfig().vendor;
    if (vendor != null) return vendor;
  } catch (err) {
    console.warn(
      `[nous:first-run] resolvePrincipalVendor failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return 'text';
}

function getProfilePolicy(ctx: { config: { get(): unknown } }) {
  const config = ctx.config.get() as {
    profile?: {
      name?: string;
      allowLocalProviders?: boolean;
      allowRemoteProviders?: boolean;
    };
  };

  return config.profile ?? {
    name: 'local-only',
    allowLocalProviders: true,
    allowRemoteProviders: false,
  };
}

function buildProviderSelection(
  modelSpec: string,
): {
  providerId: ProviderId;
  providerConfig: ModelProviderConfig;
} | null {
  const selectedModel = parseSelectedModelSpec(modelSpec);
  if (!selectedModel) {
    return null;
  }

  if (selectedModel.provider === 'ollama') {
    return {
      providerId: OLLAMA_WELL_KNOWN_PROVIDER_ID,
      providerConfig: buildOllamaProviderConfig(
        selectedModel.modelId,
        OLLAMA_WELL_KNOWN_PROVIDER_ID,
      ),
    };
  }

  const providerId = WELL_KNOWN_PROVIDER_IDS[selectedModel.provider];
  return {
    providerId,
    providerConfig: buildProviderConfig(
      selectedModel.provider,
      providerId,
      selectedModel.modelId,
    ),
  };
}

async function actionFailure(ctx: { dataDir: string }, error: string) {
  return FirstRunActionResultSchema.parse({
    success: false,
    state: await getFirstRunState(ctx.dataDir),
    error,
  });
}

export const firstRunRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const complete = await isFirstRunComplete(
      ctx.dataDir,
      ctx.projectStore,
    );
    return { complete };
  }),

  complete: publicProcedure.mutation(({ ctx }) => {
    markFirstRunComplete(ctx.dataDir);
  }),

  getWizardState: publicProcedure.query(async ({ ctx }) => {
    return getFirstRunState(ctx.dataDir);
  }),

  checkPrerequisites: publicProcedure.query(async ({ ctx }) => {
    const [ollama, hardware] = await Promise.all([
      detectOllama(),
      detectHardware(),
    ]);
    const recommendations = recommendModels(hardware, getProfilePolicy(ctx));

    // SP 1.5 — assemble the registry-availability validation map for the
    // recommendation set. The map is returned alongside `recommendations`
    // so the renderer can render a per-card validation indicator without
    // a second transport call (SDS § 0 Note 4 binding).
    const recommendedSpecs: string[] = [];
    if (recommendations.singleModel) {
      recommendedSpecs.push(recommendations.singleModel.modelSpec);
    }
    for (const entry of recommendations.multiModel) {
      recommendedSpecs.push(entry.recommendation.modelSpec);
    }
    // SP 1.8 Fix #7b — pass the locally-installed model id list (from
    // `OllamaStatus.models`) so `buildValidationMap` can derive
    // `'validated'` from local presence without a registry HEAD probe.
    const validation = await buildValidationMap(recommendedSpecs, ollama.models);

    let validatedCount = 0;
    let unavailableCount = 0;
    let offlineCount = 0;
    for (const state of Object.values(validation)) {
      if (state === 'validated') validatedCount += 1;
      else if (state === 'unavailable') unavailableCount += 1;
      else if (state === 'offline') offlineCount += 1;
    }

    console.info(
      `[nous:first-run] Wizard prerequisites: ollama=${ollama.state}, models=${ollama.models.length}`,
    );
    console.info(
      `[nous:first-run] validation map: ${validatedCount} validated, ${unavailableCount} unavailable, ${offlineCount} offline`,
    );

    return {
      ollama,
      hardware,
      recommendations,
      validation,
    };
  }),

  // SP 1.5 — standalone availability check used by the wizard's custom-spec
  // submit lane (`WizardStepModelDownload.handleDownload` → `validateCustomSpec`
  // when the resolved spec is NOT in the recommendation set). The
  // `checkPrerequisites` query already provides validation for the curated
  // catalog; this procedure handles the on-submit case for user-typed specs.
  validateModelAvailability: publicProcedure
    .input(
      z.object({
        modelSpec: z.string().min(1),
      }),
    )
    .query(async ({ input }): Promise<{ modelSpec: string; state: ValidationState }> => {
      const state = await checkRegistryAvailability(input.modelSpec);
      return { modelSpec: input.modelSpec, state };
    }),

  downloadModel: publicProcedure
    .input(
      z.object({
        model: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.info(
          `[nous:first-run] Model download initiated: ${input.model}`,
        );
        await pullOllamaModel(input.model);
        const state = await markStepComplete(ctx.dataDir, 'model_download');
        return FirstRunActionResultSchema.parse({
          success: true,
          state,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return actionFailure(ctx, message);
      }
    }),

  configureProvider: publicProcedure
    .input(
      z.object({
        modelSpec: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const selection = buildProviderSelection(input.modelSpec);
      if (!selection) {
        const error = `Cannot parse model spec: ${input.modelSpec}`;
        console.warn(`[nous:first-run] ${error}`);
        return actionFailure(ctx, error);
      }

      try {
        await upsertProviderConfig(ctx, selection.providerConfig);
        await updateRoleAssignment(ctx, 'cortex-chat', selection.providerId);
        const state = await markStepComplete(ctx.dataDir, 'provider_config');

        return FirstRunActionResultSchema.parse({
          success: true,
          state,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return actionFailure(ctx, message);
      }
    }),

  assignRoles: publicProcedure
    .input(
      z.object({
        assignments: z.array(FirstRunRoleAssignmentInputSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resolvedAssignments = input.assignments.map((assignment) => {
        const selection = buildProviderSelection(assignment.modelSpec);
        if (!selection) {
          return {
            ...assignment,
            error: `Cannot parse model spec: ${assignment.modelSpec}`,
          };
        }

        return {
          ...assignment,
          ...selection,
        };
      });

      const invalidAssignment = resolvedAssignments.find(
        (assignment) => 'error' in assignment,
      );
      if (invalidAssignment && 'error' in invalidAssignment) {
        console.warn(`[nous:first-run] ${invalidAssignment.error}`);
        return actionFailure(ctx, invalidAssignment.error);
      }

      try {
        for (const assignment of resolvedAssignments) {
          if ('error' in assignment) {
            continue;
          }

          await upsertProviderConfig(ctx, assignment.providerConfig);
          await updateRoleAssignment(ctx, assignment.role, assignment.providerId);
          console.info(
            `[nous:first-run] Role assignment: ${assignment.role} -> ${assignment.modelSpec}`,
          );
        }

        const state = await markStepComplete(ctx.dataDir, 'role_assignment');
        return FirstRunActionResultSchema.parse({
          success: true,
          state,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return actionFailure(ctx, message);
      }
    }),

  completeStep: publicProcedure
    .input(
      z.object({
        step: FirstRunStepSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return markStepComplete(ctx.dataDir, input.step);
    }),

  // SP 1.3 — Decision 7 identity-persistence-schema-v1 / Decisions 3 + 7
  // intersection. Single-batched identity-write procedure invoked once when
  // the wizard's identity step (sub-stage C — Decision 3) completes. Calls
  // the IConfig writers added in SP 1.3 (`setAgentName`,
  // `setPersonalityConfig`, `setUserProfile`), then marks the
  // `agent_identity` backend step complete. Per SDS § 0 Note 2 Posture (i),
  // the literal `'agent_identity'` is in `FIRST_RUN_STEP_VALUES` (added in
  // SP 1.3), so the markStepComplete call typechecks.
  //
  // No payload echo in logs (SDS § 5 security posture #3): only the error
  // message surfaces in `console.warn`.
  writeIdentity: publicProcedure
    .input(WriteIdentityInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.config.setAgentName(input.name);
        await ctx.config.setPersonalityConfig(input.personality);
        await ctx.config.setUserProfile(input.profile);
        const state = await markStepComplete(ctx.dataDir, 'agent_identity');

        // SP 1.9 Fix #4 — trigger harness recompose so the new agent-block
        // state surfaces in the Principal's cached promptFormatter. Vendor
        // lookup mirrors the web/desktop bootstrap registry-lookup idiom
        // (web/server/bootstrap.ts:50-53; desktop/server/main.ts:224-227).
        // Graceful-degradation per SDS § 0 Note 10: on any lookup failure,
        // fall back to 'text' and let the next attachProviders /
        // preferences.setRoleAssignment re-sync the adapter. SDS I8: the
        // WR-148 turn-in-progress deferral is preserved by
        // recomposeHarnessForClass internally.
        try {
          const vendor = resolvePrincipalVendor(ctx);
          ctx.gatewayRuntime.recomposeHarnessForClass('Cortex::Principal', vendor);
          console.info(
            `[nous:first-run] recompose triggered for Cortex::Principal vendor=${vendor}`,
          );
        } catch (recomposeErr) {
          const msg = recomposeErr instanceof Error ? recomposeErr.message : String(recomposeErr);
          console.warn(
            `[nous:first-run] recompose skipped after writeIdentity: ${msg}`,
          );
        }

        return FirstRunActionResultSchema.parse({
          success: true,
          state,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[nous:first-run] writeIdentity failed: ${message}`);
        return actionFailure(ctx, message);
      }
    }),

  resetWizard: publicProcedure.mutation(async ({ ctx }) => {
    // SP 1.3 § 0 Note 1 Option B — clear `agent` block first, then reset
    // wizard state. Order rationale (folds SDS-review Should-Fix #1):
    //   - Clear-first matches the wizard's natural data-then-state flow on
    //     the `writeIdentity` companion procedure (writers run first, then
    //     `markStepComplete`).
    //   - Both operations are idempotent: re-clearing an absent `agent`
    //     block is a no-op (ConfigManager.clearAgentBlock early-returns);
    //     deleting a non-existent wizard-state file is fine. A partial
    //     failure between the two steps (F2) is recoverable on retry.
    //   - `resetFirstRunState(ctx.dataDir)` is unchanged from today — the
    //     helper lives at `self/apps/shared-server/src/first-run.ts`
    //     (folds SDS-review Note 5 line-citation alignment).
    await ctx.config.clearAgentBlock();

    // SP 1.9 Fix #5 — same recompose trigger as writeIdentity (Fix #4).
    // After the agent block clears, the Principal's harness still holds
    // the previous identity in its cached promptFormatter; the recompose
    // forces it to re-read from `IConfig` (which now returns defaults).
    try {
      const vendor = resolvePrincipalVendor(ctx);
      ctx.gatewayRuntime.recomposeHarnessForClass('Cortex::Principal', vendor);
      console.info(
        `[nous:first-run] recompose triggered for Cortex::Principal vendor=${vendor} (resetWizard)`,
      );
    } catch (recomposeErr) {
      const msg = recomposeErr instanceof Error ? recomposeErr.message : String(recomposeErr);
      console.warn(
        `[nous:first-run] recompose skipped after resetWizard: ${msg}`,
      );
    }

    return resetFirstRunState(ctx.dataDir);
  }),
});
