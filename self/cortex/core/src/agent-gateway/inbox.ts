import { randomUUID } from 'node:crypto';
import {
  GatewayContextFrameSchema,
  GatewayInboxMessageSchema,
  type GatewayContextFrame,
  type GatewayInboxMessage,
  type IGatewayInboxHandle,
} from '@nous/shared';

function defaultNow(): string {
  return new Date().toISOString();
}

export class GatewayInbox {
  private readonly queue: GatewayInboxMessage[] = [];

  constructor(
    private readonly now: () => string = defaultNow,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  getHandle(): IGatewayInboxHandle {
    return {
      send: async (message) => {
        this.queue.push(GatewayInboxMessageSchema.parse(message));
      },
      abort: async (reason) => {
        this.queue.push(
          GatewayInboxMessageSchema.parse({
            type: 'abort',
            messageId: this.idFactory(),
            reason,
            createdAt: this.now(),
          }),
        );
      },
      injectContext: async (frameOrFrames) => {
        const frames = Array.isArray(frameOrFrames)
          ? frameOrFrames
          : [frameOrFrames];
        this.queue.push(
          GatewayInboxMessageSchema.parse({
            type: 'inject_context',
            messageId: this.idFactory(),
            frames: frames.map((frame) => GatewayContextFrameSchema.parse(frame)),
            createdAt: this.now(),
          }),
        );
      },
    };
  }

  async drain(): Promise<GatewayInboxMessage[]> {
    const messages = this.queue.slice();
    this.queue.length = 0;
    return messages;
  }
}

export function createInboxFrame(
  content: string,
  now: () => string = defaultNow,
): GatewayContextFrame {
  return GatewayContextFrameSchema.parse({
    role: 'system',
    source: 'inbox',
    content,
    createdAt: now(),
  });
}
