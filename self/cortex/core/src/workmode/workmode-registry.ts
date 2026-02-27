/**
 * In-memory workmode registry implementation.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import type { WorkmodeContract, WorkmodeId } from '@nous/shared';
import type { IWorkmodeRegistry } from '@nous/shared';

export class InMemoryWorkmodeRegistry implements IWorkmodeRegistry {
  private readonly contracts = new Map<string, WorkmodeContract>();

  register(contract: WorkmodeContract): void {
    this.contracts.set(contract.workmode_id, contract);
  }

  get(workmodeId: WorkmodeId): WorkmodeContract | null {
    return this.contracts.get(workmodeId) ?? null;
  }

  list(): WorkmodeId[] {
    return Array.from(this.contracts.keys());
  }
}
