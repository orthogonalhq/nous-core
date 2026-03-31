import type { MaoAgentLifecycleState } from '@nous/shared';

export interface StateColorResult {
  /** Tailwind bg class for dot/square */
  dot: string;
  /** Tailwind border + bg classes for tile tone */
  tone: string;
  /** CSS utility class for motion pulse (empty string = no pulse) */
  pulse: string;
  /** true for completed, canceled, hard_stopped */
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
        dot: 'bg-emerald-500',
        tone: 'border-emerald-500/40 bg-emerald-500/10',
        pulse: 'nous-state-pulse-subtle',
        isTerminal: false,
      };
    case 'blocked':
    case 'waiting_pfc':
      return {
        dot: 'bg-amber-500',
        tone: 'border-amber-500/40 bg-amber-500/10',
        pulse: 'nous-state-pulse-strong',
        isTerminal: false,
      };
    case 'failed':
      return {
        dot: 'bg-red-500',
        tone: 'border-red-500/40 bg-red-500/10',
        pulse: 'nous-state-pulse-strong',
        isTerminal: false,
      };
    case 'completed':
      return {
        dot: 'bg-slate-400',
        tone: 'border-slate-500/40 bg-slate-500/10',
        pulse: '',
        isTerminal: true,
      };
    case 'canceled':
      return {
        dot: 'bg-slate-500',
        tone: 'border-slate-500/40 bg-slate-500/10',
        pulse: '',
        isTerminal: true,
      };
    case 'hard_stopped':
      return {
        dot: 'bg-red-700',
        tone: 'border-red-700/40 bg-red-700/10',
        pulse: '',
        isTerminal: true,
      };
    default:
      // paused, queued, ready, waiting_async
      return {
        dot: 'bg-slate-400',
        tone: 'border-border bg-background',
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
