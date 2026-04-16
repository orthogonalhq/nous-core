import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '../event-bus/types.js';

export interface IThoughtEmitter {
  emitPfcDecision(payload: ThoughtPfcDecisionPayload): void;
  emitTurnLifecycle(payload: ThoughtTurnLifecyclePayload): void;
  resetSequence(): void;
}
