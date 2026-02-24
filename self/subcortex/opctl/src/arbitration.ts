/**
 * Concurrent command arbitration. Deterministic precedence per OPCTL-005.
 */
import type { ControlAction } from '@nous/shared';

const PRECEDENCE_ORDER: ControlAction[] = [
  'hard_stop',
  'cancel',
  'pause',
  'revert_to_previous_state',
  'revert',
  'resume',
  'retry_step',
  'retry',
  'edit_submitted_prompt',
  'edit',
  'stop_response',
];

const PRECEDENCE_MAP = new Map(PRECEDENCE_ORDER.map((a, i) => [a, i]));

/**
 * Returns precedence rank (lower = higher priority).
 */
export function getPrecedence(action: ControlAction): number {
  return PRECEDENCE_MAP.get(action) ?? 999;
}

/**
 * Returns true if action1 has higher precedence than action2.
 */
export function hasHigherPrecedence(action1: ControlAction, action2: ControlAction): boolean {
  return getPrecedence(action1) < getPrecedence(action2);
}
