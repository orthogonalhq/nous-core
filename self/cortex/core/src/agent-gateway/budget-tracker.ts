import type {
  GatewayBudget,
  GatewayBudgetExhaustionReason,
  GatewayBudgetUsage,
} from '@nous/shared';

export interface BudgetTrackerOptions {
  budget: GatewayBudget;
  spawnBudgetCeiling: number;
  nowMs?: () => number;
  startedAtMs?: number;
}

export function estimateBudgetUnits(
  budget?: Partial<GatewayBudget>,
): number {
  if (!budget) {
    return 0;
  }

  const turns = budget.maxTurns ?? 0;
  const tokens = Math.ceil((budget.maxTokens ?? 0) / 1000);
  const timeout = Math.ceil((budget.timeoutMs ?? 0) / 1000);
  return Math.max(0, turns + tokens + timeout);
}

export function estimateUsageUnits(usage: GatewayBudgetUsage): number {
  return (
    usage.turnsUsed +
    Math.ceil(usage.tokensUsed / 1000) +
    Math.ceil(usage.elapsedMs / 1000) +
    usage.spawnUnitsUsed
  );
}

export class BudgetTracker {
  private readonly nowMs: () => number;
  private readonly startedAtMs: number;
  private turnsUsed = 0;
  private tokensUsed = 0;
  private spawnUnitsUsed = 0;
  private spawnBudgetExceeded = false;

  constructor(private readonly options: BudgetTrackerOptions) {
    this.nowMs = options.nowMs ?? Date.now;
    this.startedAtMs = options.startedAtMs ?? this.nowMs();
  }

  recordModelUsage(usage?: {
    inputTokens?: number;
    outputTokens?: number;
  }): GatewayBudgetUsage {
    this.tokensUsed += Math.max(0, usage?.inputTokens ?? 0);
    this.tokensUsed += Math.max(0, usage?.outputTokens ?? 0);
    return this.getUsage();
  }

  recordTurn(): GatewayBudgetUsage {
    this.turnsUsed += 1;
    return this.getUsage();
  }

  requestSpawn(units: number): boolean {
    const normalized = Math.max(0, Math.ceil(units));
    if (normalized === 0) {
      return true;
    }

    if (this.spawnUnitsUsed + normalized > this.options.spawnBudgetCeiling) {
      this.spawnBudgetExceeded = true;
      return false;
    }

    return true;
  }

  consumeSpawnUnits(units: number): GatewayBudgetUsage {
    this.spawnUnitsUsed += Math.max(0, Math.ceil(units));
    return this.getUsage();
  }

  getUsage(): GatewayBudgetUsage {
    return {
      turnsUsed: this.turnsUsed,
      tokensUsed: this.tokensUsed,
      elapsedMs: Math.max(0, this.nowMs() - this.startedAtMs),
      spawnUnitsUsed: this.spawnUnitsUsed,
    };
  }

  getExhaustedReason(): GatewayBudgetExhaustionReason | null {
    const usage = this.getUsage();

    if (this.spawnBudgetExceeded) {
      return 'spawn_budget';
    }

    if (usage.turnsUsed >= this.options.budget.maxTurns) {
      return 'turns';
    }

    if (usage.tokensUsed >= this.options.budget.maxTokens) {
      return 'tokens';
    }

    if (usage.elapsedMs >= this.options.budget.timeoutMs) {
      return 'timeout';
    }

    return null;
  }
}
