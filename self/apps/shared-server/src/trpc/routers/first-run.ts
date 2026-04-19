/**
 * First-run tRPC router.
 */
import { z } from 'zod';
import type { ModelProviderConfig, ProviderId } from '@nous/shared';
import {
  PersonalityConfigSchema,
  UserProfileSchema,
} from '@nous/autonomic-config';
import { router, publicProcedure } from '../trpc';
import { detectHardware, recommendModels } from '../../hardware-detection';
import { detectOllama, pullOllamaModel } from '../../ollama-detection';
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

    console.info(
      `[nous:first-run] Wizard prerequisites: ollama=${ollama.state}, models=${ollama.models.length}`,
    );

    return {
      ollama,
      hardware,
      recommendations,
    };
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
    return resetFirstRunState(ctx.dataDir);
  }),
});
