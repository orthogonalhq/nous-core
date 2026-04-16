/**
 * First-run tRPC router.
 */
import { z } from 'zod';
import type { ModelProviderConfig, ProviderId } from '@nous/shared';
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

  resetWizard: publicProcedure.mutation(async ({ ctx }) => {
    return resetFirstRunState(ctx.dataDir);
  }),
});
