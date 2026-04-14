import type { IEventBus, IThoughtEmitter, ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared';

export class ThoughtEmitterImpl implements IThoughtEmitter {
  private sequence = 0;

  constructor(private readonly eventBus: IEventBus) {}

  emitPfcDecision(payload: ThoughtPfcDecisionPayload): void {
    try {
      this.eventBus.publish('thought:pfc-decision', { ...payload, sequence: this.sequence++ });
    } catch { /* fire-and-forget */ }
  }

  emitTurnLifecycle(payload: ThoughtTurnLifecyclePayload): void {
    try {
      this.eventBus.publish('thought:turn-lifecycle', { ...payload, sequence: this.sequence++ });
    } catch { /* fire-and-forget */ }
  }

  resetSequence(): void {
    this.sequence = 0;
  }
}
