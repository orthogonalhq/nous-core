import { randomUUID } from 'node:crypto';
import type {
  VoiceAssistantOutputInput,
  VoiceAssistantOutputStateRecord,
  VoiceBargeInInput,
  VoiceBargeInRecord,
  VoiceContinuationInput,
  VoiceContinuationRecord,
  VoiceTurnState,
} from '@nous/shared';
import {
  VoiceAssistantOutputStateRecordSchema,
  VoiceBargeInRecordSchema,
  VoiceContinuationRecordSchema,
} from '@nous/shared';

export interface ContinuationOrchestratorOptions {
  now?: () => string;
  idFactory?: () => string;
}

export class ContinuationOrchestrator {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: ContinuationOrchestratorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  registerOutput(
    input: VoiceAssistantOutputInput,
  ): VoiceAssistantOutputStateRecord {
    const startedAt = input.started_at ?? this.now();
    return VoiceAssistantOutputStateRecordSchema.parse({
      output_id: input.output_id ?? this.idFactory(),
      session_id: input.session_id,
      project_id: input.project_id,
      state: input.state,
      output_hash: input.output_hash,
      started_at: startedAt,
      completed_at: input.completed_at,
      updated_at: input.completed_at ?? startedAt,
      evidence_refs: input.evidence_refs,
    });
  }

  handleBargeIn(input: VoiceBargeInInput): VoiceBargeInRecord {
    const latencyMs = Math.max(
      0,
      Date.parse(input.stop_completed_at) - Date.parse(input.detected_at),
    );
    return VoiceBargeInRecordSchema.parse({
      barge_in_id: input.barge_in_id ?? this.idFactory(),
      session_id: input.session_id,
      project_id: input.project_id,
      active_output_id: input.active_output_id,
      latency_ms: latencyMs,
      continuation_required: true,
      evidence_refs:
        input.evidence_refs.length > 0
          ? input.evidence_refs
          : [`voice_barge_in:${input.active_output_id}`],
      detected_at: input.detected_at,
      stop_completed_at: input.stop_completed_at,
    });
  }

  resolve(
    input: VoiceContinuationInput,
    currentOutput: VoiceAssistantOutputStateRecord | null,
  ): {
    continuation: VoiceContinuationRecord;
    nextOutputState: VoiceAssistantOutputStateRecord | null;
    nextTurnState: VoiceTurnState;
  } {
    const resolvedAt = input.requested_at ?? this.now();
    const nextOutputStateValue =
      input.resolution === 'resume_assistant' ? 'speaking' : 'completed';
    const nextTurnState: VoiceTurnState = 'completed';

    const nextOutputState = currentOutput
      ? VoiceAssistantOutputStateRecordSchema.parse({
          ...currentOutput,
          state: nextOutputStateValue,
          completed_at:
            nextOutputStateValue === 'completed'
              ? resolvedAt
              : currentOutput.completed_at,
          updated_at: resolvedAt,
          evidence_refs: [
            ...new Set([
              ...currentOutput.evidence_refs,
              ...input.evidence_refs,
            ]),
          ],
        })
      : null;

    return {
      continuation: VoiceContinuationRecordSchema.parse({
        continuation_id: input.continuation_id ?? this.idFactory(),
        session_id: input.session_id,
        project_id: input.project_id,
        output_id: input.output_id ?? currentOutput?.output_id,
        resolution: input.resolution,
        continuation_required: false,
        assistant_output_state: nextOutputState?.state ?? 'completed',
        turn_state: nextTurnState,
        evidence_refs:
          input.evidence_refs.length > 0
            ? input.evidence_refs
            : [`voice_continuation:${input.session_id}`],
        resolved_at: resolvedAt,
      }),
      nextOutputState,
      nextTurnState,
    };
  }
}
