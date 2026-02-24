/**
 * Envelope validation and signature verification.
 * OPCTL-001: No control command may execute without valid command signature.
 */
import type {
  ControlCommandEnvelope,
  ControlCommandId,
} from '@nous/shared';
import { ControlCommandEnvelopeSchema } from '@nous/shared';
import type { ReplayStore } from './replay-store.js';

export interface EnvelopeValidationResult {
  valid: boolean;
  reason?: string;
  reasonCode?: string;
}

/**
 * Validates envelope structure and anti-replay invariants.
 * Phase 2.5 baseline: signature verification is stubbed (always valid for local Principal).
 */
export async function validateEnvelope(
  raw: unknown,
  replayStore: ReplayStore,
): Promise<{ envelope: ControlCommandEnvelope } | EnvelopeValidationResult> {
  const parsed = ControlCommandEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, reason: 'Invalid envelope structure', reasonCode: 'OPCTL-001' };
  }
  const envelope = parsed.data;

  const now = new Date().toISOString();
  if (envelope.expires_at < now) {
    return { valid: false, reason: 'Command expired', reasonCode: 'OPCTL-002' };
  }

  const used = await replayStore.isCommandIdUsed(envelope.control_command_id as ControlCommandId);
  if (used) {
    return { valid: false, reason: 'Replay detected: command ID already used', reasonCode: 'OPCTL-002' };
  }

  const nonceUsed = await replayStore.isNonceUsed(envelope.nonce);
  if (nonceUsed) {
    return { valid: false, reason: 'Replay detected: nonce reused', reasonCode: 'OPCTL-002' };
  }

  const lastSeq = await replayStore.getLastActorSeq(envelope.actor_session_id);
  if (lastSeq !== null && envelope.actor_seq <= lastSeq) {
    return { valid: false, reason: 'Out-of-order actor_seq', reasonCode: 'OPCTL-002' };
  }

  // Phase 2.5: stub signature verification — always accept for baseline
  // Full key lifecycle and verification deferred to follow-up
  return { envelope };
}
