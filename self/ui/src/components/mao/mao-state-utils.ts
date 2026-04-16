import type { CSSProperties } from 'react';
import type { MaoAgentLifecycleState } from '@nous/shared';

/**
 * Visual properties for a given MAO agent lifecycle state.
 * All colour values reference CSS custom properties from tokens.css.
 */
export interface StateColorResult {
  /** Inline style for state dot/square: { backgroundColor: 'var(--nous-state-*)' } */
  dotStyle: CSSProperties;
  /**
   * Inline style for tile tone surface:
   * { borderColor: 'var(--nous-state-*-tone-border)', backgroundColor: 'var(--nous-state-*-tone-bg)' }
   */
  toneStyle: CSSProperties;
  /** CSS utility class for motion pulse animation. Empty string means no pulse. */
  pulse: string;
  /** True for terminal states: completed, canceled, hard_stopped. */
  isTerminal: boolean;
}

/**
 * Centralized state-to-visual mapping for all MAO agent tile surfaces.
 * Eliminates the triplicated stateColorDot/toneClasses logic across
 * mao-density-grid, mao-workflow-group-card, and mao-lease-tree.
 */
export function getStateVisuals(state: MaoAgentLifecycleState): StateColorResult {
  switch (state) {
    case 'running':
    case 'resuming':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-active)' },
        toneStyle: {
          borderColor: 'var(--nous-state-active-tone-border)',
          backgroundColor: 'var(--nous-state-active-tone-bg)',
        },
        pulse: 'nous-state-pulse-subtle',
        isTerminal: false,
      };
    case 'blocked':
    case 'waiting_pfc':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-waiting)' },
        toneStyle: {
          borderColor: 'var(--nous-state-waiting-tone-border)',
          backgroundColor: 'var(--nous-state-waiting-tone-bg)',
        },
        pulse: 'nous-state-pulse-strong',
        isTerminal: false,
      };
    case 'failed':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-blocked)' },
        toneStyle: {
          borderColor: 'var(--nous-state-blocked-tone-border)',
          backgroundColor: 'var(--nous-state-blocked-tone-bg)',
        },
        pulse: 'nous-state-pulse-strong',
        isTerminal: false,
      };
    case 'completed':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-complete)' },
        toneStyle: {
          borderColor: 'var(--nous-state-complete-tone-border)',
          backgroundColor: 'var(--nous-state-complete-tone-bg)',
        },
        pulse: '',
        isTerminal: true,
      };
    case 'canceled':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-idle)' },
        toneStyle: {
          borderColor: 'var(--nous-state-idle-tone-border)',
          backgroundColor: 'var(--nous-state-idle-tone-bg)',
        },
        pulse: '',
        isTerminal: true,
      };
    case 'hard_stopped':
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-blocked)' },
        toneStyle: {
          borderColor: 'var(--nous-state-blocked-tone-border)',
          backgroundColor: 'var(--nous-state-blocked-tone-bg)',
        },
        pulse: '',
        isTerminal: true,
      };
    default:
      // paused, queued, ready, waiting_async
      return {
        dotStyle: { backgroundColor: 'var(--nous-state-idle)' },
        toneStyle: {
          borderColor: 'var(--nous-state-idle-tone-border)',
          backgroundColor: 'var(--nous-state-idle-tone-bg)',
        },
        pulse: '',
        isTerminal: false,
      };
  }
}

/**
 * Cluster rendering order for D4 density mode.
 * Active states first, then passive, then terminal.
 */
export const CLUSTER_STATE_ORDER: MaoAgentLifecycleState[] = [
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
];
