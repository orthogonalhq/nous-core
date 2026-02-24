/**
 * Replay store — tracks used command IDs, nonces, and actor session sequences.
 * Prevents replay attacks per OPCTL-002.
 */
import type { ControlCommandId } from '@nous/shared';

export interface ReplayStore {
  isCommandIdUsed(id: ControlCommandId): Promise<boolean>;
  markCommandIdUsed(id: ControlCommandId): Promise<void>;
  isNonceUsed(nonce: string): Promise<boolean>;
  markNonceUsed(nonce: string): Promise<void>;
  getLastActorSeq(sessionId: string): Promise<number | null>;
  setActorSeq(sessionId: string, seq: number): Promise<void>;
}

/**
 * In-memory implementation for Phase 2.5 baseline.
 * Production may use persistent document store with TTL.
 */
export class InMemoryReplayStore implements ReplayStore {
  private usedCommandIds = new Set<string>();
  private usedNonces = new Set<string>();
  private actorSeqs = new Map<string, number>();

  async isCommandIdUsed(id: ControlCommandId): Promise<boolean> {
    return this.usedCommandIds.has(id);
  }

  async markCommandIdUsed(id: ControlCommandId): Promise<void> {
    this.usedCommandIds.add(id);
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    return this.usedNonces.has(nonce);
  }

  async markNonceUsed(nonce: string): Promise<void> {
    this.usedNonces.add(nonce);
  }

  async getLastActorSeq(sessionId: string): Promise<number | null> {
    return this.actorSeqs.get(sessionId) ?? null;
  }

  async setActorSeq(sessionId: string, seq: number): Promise<void> {
    this.actorSeqs.set(sessionId, seq);
  }
}
