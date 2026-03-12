import type {
  GatewayAgentId,
  GatewayCorrelation,
  GatewayRunId,
} from '@nous/shared';

export class CorrelationSequencer {
  private sequence: number;

  constructor(
    private readonly runId: GatewayRunId,
    private readonly parentId?: GatewayAgentId,
    initialSequence = 0,
  ) {
    this.sequence = initialSequence;
  }

  static fromCorrelation(correlation: GatewayCorrelation): CorrelationSequencer {
    return new CorrelationSequencer(
      correlation.runId,
      correlation.parentId,
      correlation.sequence,
    );
  }

  snapshot(): GatewayCorrelation {
    return {
      runId: this.runId,
      parentId: this.parentId,
      sequence: this.sequence,
    };
  }

  next(): GatewayCorrelation {
    this.sequence += 1;
    return this.snapshot();
  }
}
