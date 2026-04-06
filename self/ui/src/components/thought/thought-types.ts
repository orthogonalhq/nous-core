import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

export type ThoughtEvent =
  | { channel: 'thought:pfc-decision'; payload: ThoughtPfcDecisionPayload }
  | { channel: 'thought:turn-lifecycle'; payload: ThoughtTurnLifecyclePayload }
