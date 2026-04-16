/**
 * IEventBus — Interface contract for the Nous in-process event bus.
 *
 * Typed against EventChannelMap for compile-time channel/payload safety.
 * Implementations must provide error isolation (one failing handler does
 * not block others) and clean disposal semantics.
 */
import type { EventChannelMap } from './types.js';

export interface IEventBus {
  /**
   * Publish an event to all subscribers of the given channel.
   * Synchronous fan-out. Does not throw even if handlers throw.
   * After dispose(), publish is a silent no-op.
   */
  publish<C extends keyof EventChannelMap>(channel: C, payload: EventChannelMap[C]): void;

  /**
   * Subscribe to events on a channel.
   * @returns A unique subscription ID (UUID) for later unsubscription.
   */
  subscribe<C extends keyof EventChannelMap>(
    channel: C,
    handler: (payload: EventChannelMap[C]) => void,
  ): string;

  /**
   * Remove a subscription by its ID. No-op if the ID is unknown.
   */
  unsubscribe(subscriptionId: string): void;

  /**
   * Dispose the bus: remove all subscriptions. Subsequent publish
   * calls become silent no-ops. Subsequent subscribe calls are ignored.
   */
  dispose(): void;
}
