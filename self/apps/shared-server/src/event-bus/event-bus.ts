/**
 * EventBus — In-process typed event bus implementation.
 *
 * Implements IEventBus with:
 * - Dual-indexed subscription storage (by ID and by channel) for O(1) lookups
 * - UUID-based subscription IDs via crypto.randomUUID()
 * - Error isolation: each handler invocation is individually try/caught
 * - Clean disposal semantics
 */
import { randomUUID } from 'node:crypto';
import type { EventChannelMap, IEventBus } from '@nous/shared';

type Handler<T = unknown> = (payload: T) => void;

interface Subscription {
  channel: string;
  handler: Handler;
}

export class EventBus implements IEventBus {
  /** Map from subscriptionId (UUID) to Subscription. */
  private subscriptions = new Map<string, Subscription>();

  /** Map from channel name to Set of subscriptionIds for O(1) fan-out. */
  private channelIndex = new Map<string, Set<string>>();

  /** Once disposed, publish and subscribe become no-ops. */
  private disposed = false;

  publish<C extends keyof EventChannelMap>(channel: C, payload: EventChannelMap[C]): void {
    if (this.disposed) {
      return;
    }

    const subscriberIds = this.channelIndex.get(channel as string);
    if (!subscriberIds || subscriberIds.size === 0) {
      return;
    }

    for (const id of subscriberIds) {
      const subscription = this.subscriptions.get(id);
      if (!subscription) {
        continue;
      }
      try {
        subscription.handler(payload);
      } catch (error) {
        console.error(
          `[nous:event-bus] handler-error channel=${String(channel)} subscriptionId=${id} error=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  subscribe<C extends keyof EventChannelMap>(
    channel: C,
    handler: (payload: EventChannelMap[C]) => void,
  ): string {
    if (this.disposed) {
      return '';
    }

    const subscriptionId = randomUUID();
    const channelKey = channel as string;

    this.subscriptions.set(subscriptionId, {
      channel: channelKey,
      handler: handler as Handler,
    });

    let channelSet = this.channelIndex.get(channelKey);
    if (!channelSet) {
      channelSet = new Set();
      this.channelIndex.set(channelKey, channelSet);
    }
    channelSet.add(subscriptionId);

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    this.subscriptions.delete(subscriptionId);
    const channelSet = this.channelIndex.get(subscription.channel);
    if (channelSet) {
      channelSet.delete(subscriptionId);
      if (channelSet.size === 0) {
        this.channelIndex.delete(subscription.channel);
      }
    }
  }

  dispose(): void {
    this.subscriptions.clear();
    this.channelIndex.clear();
    this.disposed = true;
  }
}
