/**
 * Scope lock for concurrent command arbitration.
 * Phase 2.5: Acquire lock per scope before apply; block lower-precedence commands.
 */
import type { ControlAction } from '@nous/shared';
import { getPrecedence } from './arbitration.js';

interface Holder {
  action: ControlAction;
  commandId: string;
}

interface Waiter {
  resolve: (result: { acquired: true }) => void;
  action: ControlAction;
  commandId: string;
}

export interface ScopeLockStore {
  acquire(
    scopeKey: string,
    action: ControlAction,
    commandId: string,
  ): Promise<
    | { acquired: true }
    | { acquired: false; reason: 'opctl_conflict_resolved'; holderAction: ControlAction }
  >;
  release(scopeKey: string): void;
}

export class InMemoryScopeLockStore implements ScopeLockStore {
  private holders = new Map<string, Holder>();
  private waiters = new Map<string, Waiter[]>();

  async acquire(
    scopeKey: string,
    action: ControlAction,
    commandId: string,
  ): Promise<
    | { acquired: true }
    | { acquired: false; reason: 'opctl_conflict_resolved'; holderAction: ControlAction }
  > {
    const holder = this.holders.get(scopeKey);
    if (!holder) {
      this.holders.set(scopeKey, { action, commandId });
      return { acquired: true };
    }
    const ourRank = getPrecedence(action);
    const holderRank = getPrecedence(holder.action);
    if (ourRank > holderRank) {
      return {
        acquired: false,
        reason: 'opctl_conflict_resolved',
        holderAction: holder.action,
      };
    }
    return new Promise<{ acquired: true }>((resolve) => {
      const queue = this.waiters.get(scopeKey) ?? [];
      queue.push({ resolve: () => resolve({ acquired: true }), action, commandId });
      this.waiters.set(scopeKey, queue);
    });
  }

  release(scopeKey: string): void {
    this.holders.delete(scopeKey);
    const queue = this.waiters.get(scopeKey);
    if (!queue?.length) return;
    const sorted = [...queue].sort(
      (a, b) => getPrecedence(a.action) - getPrecedence(b.action),
    );
    const next = sorted[0];
    this.holders.set(scopeKey, { action: next.action, commandId: next.commandId });
    this.waiters.set(scopeKey, queue.filter((w) => w !== next));
    next.resolve({ acquired: true });
  }
}
