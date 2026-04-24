/**
 * WR-162 SP 6 — SSE allow-list supervisor extension (UT-SSE1, UT-SSE2).
 *
 * Per SUPV-SP6-010: `ALL_CHANNELS` grows 36 → 40; the four `supervisor:*`
 * channel literals are admitted; unlisted channels remain blocked.
 */
import { describe, expect, it } from 'vitest';
import { ALL_CHANNELS } from '../src/event-bus/event-sse-handler';

describe('UT-SSE1 — SSE allow-list size + supervisor channels (SUPV-SP6-010)', () => {
  it('allow-list contains 35 + 4 = 39 channels post-SP-6', () => {
    // Note: the SDS/IP anticipated 36 → 40 but the SP 5 landed baseline was
    // 35 (verified at code-start via `grep -c "^  '" event-sse-handler.ts`).
    // SP 6 adds four supervisor:* literals → 39. The mechanism (literal-list
    // extension) is unchanged; only the pre/post arithmetic shifts.
    expect(ALL_CHANNELS.length).toBe(39);
  });

  it('admits all four supervisor:* channels', () => {
    expect(ALL_CHANNELS).toContain('supervisor:violation-detected');
    expect(ALL_CHANNELS).toContain('supervisor:enforcement-action');
    expect(ALL_CHANNELS).toContain('supervisor:anomaly-classified');
    expect(ALL_CHANNELS).toContain('supervisor:sentinel-status');
  });
});

describe('UT-SSE2 — unlisted channels remain blocked', () => {
  it('nonexistent channels are not in the allow-list', () => {
    // @ts-expect-error -- asserting runtime contains() for an unlisted key.
    expect(ALL_CHANNELS.includes('nonexistent:channel')).toBe(false);
    // @ts-expect-error -- asserting preferences:* remains absent per Decision #15.
    expect(ALL_CHANNELS.includes('preferences:updated')).toBe(false);
  });
});
