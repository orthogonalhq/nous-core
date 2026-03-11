import type { VoiceDegradedModeReason, VoiceDegradedModeState } from '@nous/shared';
import { VoiceDegradedModeStateSchema } from '@nous/shared';

export interface DegradedModeTransitionInput {
  current: VoiceDegradedModeState | null;
  session_id: string;
  project_id: VoiceDegradedModeState['project_id'];
  reason?: VoiceDegradedModeReason;
  now: string;
  evidence_refs: string[];
}

export interface DegradedModeControllerOptions {
  recoveryWindowMs?: number;
}

export class DegradedModeController {
  private readonly recoveryWindowMs: number;

  constructor(options: DegradedModeControllerOptions = {}) {
    this.recoveryWindowMs = options.recoveryWindowMs ?? 30_000;
  }

  apply(input: DegradedModeTransitionInput): VoiceDegradedModeState {
    if (input.reason) {
      return VoiceDegradedModeStateSchema.parse({
        session_id: input.session_id,
        project_id: input.project_id,
        active: true,
        reason: input.reason,
        entered_at: input.current?.entered_at ?? input.now,
        recovery_window_started_at: undefined,
        last_recovered_at: input.current?.last_recovered_at,
        evidence_refs: input.evidence_refs,
      });
    }

    if (!input.current?.active) {
      return VoiceDegradedModeStateSchema.parse({
        session_id: input.session_id,
        project_id: input.project_id,
        active: false,
        evidence_refs: input.evidence_refs,
      });
    }

    const recoveryWindowStartedAt =
      input.current.recovery_window_started_at ?? input.now;
    const readyToRecover =
      Date.parse(input.now) - Date.parse(recoveryWindowStartedAt) >=
      this.recoveryWindowMs;

    if (readyToRecover) {
      return VoiceDegradedModeStateSchema.parse({
        session_id: input.session_id,
        project_id: input.project_id,
        active: false,
        entered_at: input.current.entered_at,
        recovery_window_started_at: recoveryWindowStartedAt,
        last_recovered_at: input.now,
        evidence_refs: input.evidence_refs,
      });
    }

    return VoiceDegradedModeStateSchema.parse({
      session_id: input.session_id,
      project_id: input.project_id,
      active: true,
      reason: input.current.reason,
      entered_at: input.current.entered_at,
      recovery_window_started_at: recoveryWindowStartedAt,
      last_recovered_at: input.current.last_recovered_at,
      evidence_refs: input.evidence_refs,
    });
  }
}
