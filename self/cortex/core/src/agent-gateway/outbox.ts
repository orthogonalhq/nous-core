import {
  GatewayOutboxEventSchema,
  type GatewayOutboxEvent,
  type IGatewayOutboxSink,
} from '@nous/shared';

export class GatewayOutbox {
  constructor(private readonly sink?: IGatewayOutboxSink) {}

  async emit(event: GatewayOutboxEvent): Promise<void> {
    const parsed = GatewayOutboxEventSchema.parse(event);
    if (!this.sink) {
      return;
    }
    await this.sink.emit(parsed);
  }
}

export class InMemoryGatewayOutboxSink implements IGatewayOutboxSink {
  readonly events: GatewayOutboxEvent[] = [];

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.events.push(GatewayOutboxEventSchema.parse(event));
  }
}
