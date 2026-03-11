import { describe, expect, it } from 'vitest';
import { DegradedModeController } from '../degraded-mode-controller.js';

describe('DegradedModeController', () => {
  it('enters degraded mode when a safety reason is present', () => {
    const controller = new DegradedModeController();
    const result = controller.apply({
      current: null,
      session_id: '550e8400-e29b-41d4-a716-446655449401',
      project_id: '550e8400-e29b-41d4-a716-446655449402' as any,
      reason: 'low_asr_confidence',
      now: '2026-03-11T00:00:00.000Z',
      evidence_refs: ['voice:degraded'],
    });

    expect(result.active).toBe(true);
    expect(result.reason).toBe('low_asr_confidence');
  });

  it('requires a sustained recovery window before exiting degraded mode', () => {
    const controller = new DegradedModeController({ recoveryWindowMs: 1_000 });
    const first = controller.apply({
      current: {
        session_id: '550e8400-e29b-41d4-a716-446655449401',
        project_id: '550e8400-e29b-41d4-a716-446655449402' as any,
        active: true,
        reason: 'low_asr_confidence',
        entered_at: '2026-03-11T00:00:00.000Z',
        evidence_refs: ['voice:degraded'],
      },
      session_id: '550e8400-e29b-41d4-a716-446655449401',
      project_id: '550e8400-e29b-41d4-a716-446655449402' as any,
      now: '2026-03-11T00:00:00.500Z',
      evidence_refs: ['voice:degraded'],
    });
    const second = controller.apply({
      current: first,
      session_id: '550e8400-e29b-41d4-a716-446655449401',
      project_id: '550e8400-e29b-41d4-a716-446655449402' as any,
      now: '2026-03-11T00:00:02.000Z',
      evidence_refs: ['voice:degraded'],
    });

    expect(first.active).toBe(true);
    expect(second.active).toBe(false);
    expect(second.last_recovered_at).toBe('2026-03-11T00:00:02.000Z');
  });
});
