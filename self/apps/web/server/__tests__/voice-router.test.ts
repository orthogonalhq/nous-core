import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { ProjectId } from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';

function hashTranscript(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('voice router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-voice-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('routes canonical voice turn, barge-in, continuation, and projection flows', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = randomUUID() as ProjectId;
    const sessionId = randomUUID();
    const turnId = randomUUID();
    const outputId = randomUUID();

    const turn = await caller.voice.beginTurn({
      turn_id: turnId,
      session_id: sessionId,
      project_id: projectId,
      principal_id: 'principal',
      channel: 'web',
      evidence_refs: ['voice:turn'],
    });
    expect(turn.state).toBe('listening');

    const decision = await caller.voice.evaluateTurn({
      turn_id: turnId,
      session_id: sessionId,
      project_id: projectId,
      principal_id: 'principal',
      signals: {
        transcript_hash: hashTranscript('pause the project'),
        handoff_keywords_detected: ['done'],
        semantic_completion_score: 0.95,
        silence_window_ms: 1000,
        silence_threshold_ms: 500,
        explicit_handoff_detected: true,
        asr_confidence: 0.94,
        intent_confidence: 0.93,
        handoff_confidence: 0.9,
        observed_at: '2026-03-11T00:00:00.000Z',
      },
      intents: [
        {
          intent_id: randomUUID(),
          turn_id: turnId,
          project_id: projectId,
          intent_class: 'project_control',
          action_category: 'opctl-command',
          risk_level: 'high',
          requested_action_ref: 'project.pause',
          evidence_refs: ['voice:intent'],
        },
      ],
      evidence_refs: ['voice:evaluate'],
    });
    expect(decision.outcome).toBe('text_confirmation_required');

    const output = await caller.voice.registerAssistantOutput({
      session_id: sessionId,
      project_id: projectId,
      output_id: outputId,
      output_hash: hashTranscript('Pausing the project.'),
      state: 'speaking',
      started_at: '2026-03-11T00:00:01.000Z',
      evidence_refs: ['voice:output'],
    });
    expect(output.state).toBe('speaking');

    const bargeIn = await caller.voice.handleBargeIn({
      session_id: sessionId,
      project_id: projectId,
      active_output_id: outputId,
      detected_at: '2026-03-11T00:00:01.100Z',
      stop_completed_at: '2026-03-11T00:00:01.250Z',
      evidence_refs: ['voice:barge'],
    });
    expect(bargeIn.continuation_required).toBe(true);

    let projection = await caller.voice.getSessionProjection({
      session_id: sessionId,
      project_id: projectId,
    });
    expect(projection.continuation_required).toBe(true);
    expect(projection.degraded_mode.active).toBe(true);

    await caller.voice.resolveContinuation({
      session_id: sessionId,
      project_id: projectId,
      output_id: outputId,
      principal_id: 'principal',
      resolution: 'resume_assistant',
      requested_at: '2026-03-11T00:01:00.000Z',
      evidence_refs: ['voice:continue'],
    });

    projection = await caller.voice.getSessionProjection({
      session_id: sessionId,
      project_id: projectId,
    });
    expect(projection.continuation_required).toBe(false);
  });
});
