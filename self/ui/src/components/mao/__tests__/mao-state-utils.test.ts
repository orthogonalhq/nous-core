import { describe, it, expect } from 'vitest';
import { getStateVisuals, CLUSTER_STATE_ORDER } from '../mao-state-utils';

describe('getStateVisuals', () => {
  // -- Active states --

  it('returns active token styles for running state', () => {
    const result = getStateVisuals('running');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-active)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-active-tone-border)',
      backgroundColor: 'var(--nous-state-active-tone-bg)',
    });
    expect(result.pulse).toBe('nous-state-pulse-subtle');
    expect(result.isTerminal).toBe(false);
  });

  it('returns active token styles for resuming state', () => {
    const result = getStateVisuals('resuming');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-active)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-active-tone-border)',
      backgroundColor: 'var(--nous-state-active-tone-bg)',
    });
    expect(result.pulse).toBe('nous-state-pulse-subtle');
    expect(result.isTerminal).toBe(false);
  });

  // -- Waiting states --

  it('returns waiting token styles for blocked state', () => {
    const result = getStateVisuals('blocked');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-waiting)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-waiting-tone-border)',
      backgroundColor: 'var(--nous-state-waiting-tone-bg)',
    });
    expect(result.pulse).toBe('nous-state-pulse-strong');
    expect(result.isTerminal).toBe(false);
  });

  it('returns waiting token styles for waiting_pfc state', () => {
    const result = getStateVisuals('waiting_pfc');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-waiting)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-waiting-tone-border)',
      backgroundColor: 'var(--nous-state-waiting-tone-bg)',
    });
    expect(result.pulse).toBe('nous-state-pulse-strong');
    expect(result.isTerminal).toBe(false);
  });

  // -- Blocked states --

  it('returns blocked token styles for failed state', () => {
    const result = getStateVisuals('failed');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-blocked)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-blocked-tone-border)',
      backgroundColor: 'var(--nous-state-blocked-tone-bg)',
    });
    expect(result.pulse).toBe('nous-state-pulse-strong');
    expect(result.isTerminal).toBe(false);
  });

  it('returns blocked token styles for hard_stopped state', () => {
    const result = getStateVisuals('hard_stopped');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-blocked)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-blocked-tone-border)',
      backgroundColor: 'var(--nous-state-blocked-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(true);
  });

  // -- Complete state --

  it('returns complete token styles for completed state', () => {
    const result = getStateVisuals('completed');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-complete)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-complete-tone-border)',
      backgroundColor: 'var(--nous-state-complete-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(true);
  });

  // -- Idle / terminal states --

  it('returns idle token styles for canceled state', () => {
    const result = getStateVisuals('canceled');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-idle)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-idle-tone-border)',
      backgroundColor: 'var(--nous-state-idle-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(true);
  });

  // -- Default / passive states --

  it('returns idle token styles for queued state', () => {
    const result = getStateVisuals('queued');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-idle)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-idle-tone-border)',
      backgroundColor: 'var(--nous-state-idle-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(false);
  });

  it('returns idle token styles for ready state', () => {
    const result = getStateVisuals('ready');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-idle)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-idle-tone-border)',
      backgroundColor: 'var(--nous-state-idle-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(false);
  });

  it('returns idle token styles for waiting_async state', () => {
    const result = getStateVisuals('waiting_async');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-idle)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-idle-tone-border)',
      backgroundColor: 'var(--nous-state-idle-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(false);
  });

  it('returns idle token styles for paused state', () => {
    const result = getStateVisuals('paused');
    expect(result.dotStyle).toEqual({ backgroundColor: 'var(--nous-state-idle)' });
    expect(result.toneStyle).toEqual({
      borderColor: 'var(--nous-state-idle-tone-border)',
      backgroundColor: 'var(--nous-state-idle-tone-bg)',
    });
    expect(result.pulse).toBe('');
    expect(result.isTerminal).toBe(false);
  });
});

describe('CLUSTER_STATE_ORDER', () => {
  it('contains all 12 lifecycle states in the correct order', () => {
    expect(CLUSTER_STATE_ORDER).toEqual([
      'running',
      'resuming',
      'blocked',
      'waiting_pfc',
      'failed',
      'queued',
      'ready',
      'waiting_async',
      'paused',
      'completed',
      'canceled',
      'hard_stopped',
    ]);
  });

  it('has exactly 12 entries', () => {
    expect(CLUSTER_STATE_ORDER).toHaveLength(12);
  });
});
