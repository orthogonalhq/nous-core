/**
 * IEventBus / IReadEventBus — Interface contracts for the Nous in-process event bus.
 *
 * Typed against EventChannelMap for compile-time channel/payload safety.
 * Implementations must provide error isolation (one failing handler does
 * not block others) and clean disposal semantics.
 *
 * SP 1.18 Fix #4 (b.2) — typed split. Read-only contexts (tRPC `.query()`)
 * inject `IReadEventBus`; mutation contexts inject the full `IEventBus`.
 * The split is backward-compatible: `IEventBus extends IReadEventBus`, so
 * any concrete implementation that satisfies the original `IEventBus`
 * shape automatically satisfies both halves.
 */
import type { EventChannelMap } from './types.js';

/**
 * IReadEventBus — read-only slice of the event bus surface.
 *
 * tRPC `.query()` contexts inject this narrower flavor so a future
 * `.query()` handler that tries `ctx.eventBus.publish(...)` fails to typecheck.
 * SP 1.18 Fix #4 (b.2) — typed split scoped to routers/mao.ts.
 */
export interface IReadEventBus {
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
}

/**
 * IEventBus — full event bus surface (read + publish + dispose).
 * Mutation contexts inject this flavor.
 */
export interface IEventBus extends IReadEventBus {
  /**
   * Publish an event to all subscribers of the given channel.
   * Synchronous fan-out. Does not throw even if handlers throw.
   * After dispose(), publish is a silent no-op.
   */
  publish<C extends keyof EventChannelMap>(channel: C, payload: EventChannelMap[C]): void;

  /**
   * Dispose the bus: remove all subscriptions. Subsequent publish
   * calls become silent no-ops. Subsequent subscribe calls are ignored.
   */
  dispose(): void;
}
