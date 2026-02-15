/**
 * Escalation response types for Nous-OSS.
 *
 * Supports the IEscalationService interface.
 */
import { z } from 'zod';
import { EscalationIdSchema } from './ids.js';
import { EscalationChannelSchema } from './enums.js';

// --- Escalation Response ---
// Human response to an escalation.
export const EscalationResponseSchema = z.object({
  escalationId: EscalationIdSchema,
  action: z.string(),
  message: z.string().optional(),
  respondedAt: z.string().datetime(),
  channel: EscalationChannelSchema,
});
export type EscalationResponse = z.infer<typeof EscalationResponseSchema>;
