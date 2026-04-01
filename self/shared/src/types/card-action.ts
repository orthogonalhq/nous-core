/**
 * Card action schemas for OpenUI interactive cards.
 *
 * CardActionSchema validates user interactions with rendered cards (button clicks,
 * form submissions, etc.) at the tRPC boundary. ActionResultSchema normalizes the
 * response from both executeTurn (followup) and submitTaskToSystem (approve/reject/submit).
 */
import { z } from 'zod';

// --- Card Action Type ---
export const CardActionTypeSchema = z.enum([
  'approve',
  'reject',
  'navigate',
  'submit',
  'followup',
]);
export type CardActionType = z.infer<typeof CardActionTypeSchema>;

// --- Card Action ---
export const CardActionSchema = z.object({
  actionType: CardActionTypeSchema,
  cardId: z.string(),
  payload: z.record(z.unknown()),
});
export type CardAction = z.infer<typeof CardActionSchema>;

// --- Action Result ---
// Normalized return type from chat.sendAction that covers both
// TurnResult (followup) and SystemSubmissionReceipt (approve/reject/submit).
export const ActionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  traceId: z.string().optional(),
  contentType: z.enum(['text', 'openui']).optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;
