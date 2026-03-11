import { describe, expect, it } from 'vitest';
import { ContinuationOrchestrator } from '../continuation-orchestrator.js';

describe('ContinuationOrchestrator', () => {
  it('records evidence-linked barge-in latency and requires continuation', () => {
    const orchestrator = new ContinuationOrchestrator({
      idFactory: () => '550e8400-e29b-41d4-a716-446655449301',
    });

    const result = orchestrator.handleBargeIn({
      session_id: '550e8400-e29b-41d4-a716-446655449302',
      project_id: '550e8400-e29b-41d4-a716-446655449303' as any,
      active_output_id: '550e8400-e29b-41d4-a716-446655449304',
      detected_at: '2026-03-11T00:00:00.000Z',
      stop_completed_at: '2026-03-11T00:00:00.180Z',
      evidence_refs: ['voice:barge'],
    });

    expect(result.latency_ms).toBe(180);
    expect(result.continuation_required).toBe(true);
  });

  it('resolves continuation into explicit resume-only behavior', () => {
    const orchestrator = new ContinuationOrchestrator({
      now: () => '2026-03-11T00:00:01.000Z',
      idFactory: () => '550e8400-e29b-41d4-a716-446655449305',
    });
    const result = orchestrator.resolve(
      {
        session_id: '550e8400-e29b-41d4-a716-446655449302',
        project_id: '550e8400-e29b-41d4-a716-446655449303' as any,
        resolution: 'resume_assistant',
        evidence_refs: ['voice:continue'],
      },
      {
        output_id: '550e8400-e29b-41d4-a716-446655449304',
        session_id: '550e8400-e29b-41d4-a716-446655449302',
        project_id: '550e8400-e29b-41d4-a716-446655449303' as any,
        state: 'awaiting_continuation',
        output_hash: 'a'.repeat(64),
        started_at: '2026-03-11T00:00:00.000Z',
        updated_at: '2026-03-11T00:00:00.200Z',
        evidence_refs: ['voice:output'],
      },
    );

    expect(result.continuation.continuation_required).toBe(false);
    expect(result.nextOutputState?.state).toBe('speaking');
  });
});
