/**
 * CLI provider session lifecycle contracts.
 *
 * These types describe provider process/session identity only. Conversation
 * history and STM remain owned by the cortex layer.
 */
import { z } from 'zod';
import { ProviderIdSchema } from './ids.js';

export const ChatFixtureScopeSchema = z.enum([
  'principal',
  'project_thread',
  'orphan_thread',
]);
export type ChatFixtureScope = z.infer<typeof ChatFixtureScopeSchema>;

export const ProviderSessionKeySchema = z.object({
  providerId: ProviderIdSchema,
  fixtureRole: ChatFixtureScopeSchema,
  projectId: z.string().uuid().optional(),
  chatSessionId: z.string().uuid(),
}).strict();
export type ProviderSessionKey = z.infer<typeof ProviderSessionKeySchema>;

export const CliSessionStateSchema = z.enum([
  'active',
  'busy',
  'dead',
  'teardown',
]);
export type CliSessionState = z.infer<typeof CliSessionStateSchema>;

export const CliSessionTeardownReasonSchema = z.enum([
  'chat_close',
  'provider_reassignment',
  'app_shutdown',
  'explicit_cancellation',
  'process_crash',
]);
export type CliSessionTeardownReason = z.infer<typeof CliSessionTeardownReasonSchema>;

export const CliExecutionCapabilityProfileSchema = z.enum([
  'one_shot_command',
  'session_bound_command',
  'persistent_process',
]);
export type CliExecutionCapabilityProfile = z.infer<typeof CliExecutionCapabilityProfileSchema>;

export function serializeProviderSessionKey(key: ProviderSessionKey): string {
  const parsed = ProviderSessionKeySchema.parse(key);
  return [
    parsed.providerId,
    parsed.fixtureRole,
    parsed.projectId ?? '',
    parsed.chatSessionId,
  ].join('::');
}
