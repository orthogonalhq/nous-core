/**
 * Voice tRPC router — canonical voice turn, interruption, and projection flows.
 */
import {
  VoiceAssistantOutputInputSchema,
  VoiceBargeInInputSchema,
  VoiceContinuationInputSchema,
  VoiceSessionProjectionInputSchema,
  VoiceTurnEvaluationInputSchema,
  VoiceTurnStartInputSchema,
} from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const voiceRouter = router({
  beginTurn: publicProcedure
    .input(VoiceTurnStartInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.voiceControlService.beginTurn(input);
    }),

  evaluateTurn: publicProcedure
    .input(VoiceTurnEvaluationInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.voiceControlService.evaluateTurn(input);
    }),

  registerAssistantOutput: publicProcedure
    .input(VoiceAssistantOutputInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.voiceControlService.registerAssistantOutput(input);
    }),

  handleBargeIn: publicProcedure
    .input(VoiceBargeInInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.voiceControlService.handleBargeIn(input);
    }),

  resolveContinuation: publicProcedure
    .input(VoiceContinuationInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.voiceControlService.resolveContinuation(input);
    }),

  getSessionProjection: publicProcedure
    .input(VoiceSessionProjectionInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.voiceControlService.getSessionProjection(input);
    }),
});
