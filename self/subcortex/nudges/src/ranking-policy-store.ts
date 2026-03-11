import type { NudgeRankingPolicy } from '@nous/shared';
import { DocumentNudgeStore } from './document-nudge-store.js';

export interface RankingPolicyStoreOptions {
  now?: () => string;
}

function isActive(policy: NudgeRankingPolicy, at: string): boolean {
  if (policy.effective_at > at) {
    return false;
  }
  if (policy.retired_at && policy.retired_at <= at) {
    return false;
  }
  return true;
}

export class RankingPolicyStore {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentNudgeStore,
    options: RankingPolicyStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async save(policy: NudgeRankingPolicy): Promise<NudgeRankingPolicy> {
    return this.store.saveRankingPolicy(policy);
  }

  async getPolicy(version?: string): Promise<NudgeRankingPolicy | null> {
    if (version) {
      const explicit = await this.store.getRankingPolicyByVersion(version);
      if (!explicit) {
        return null;
      }
      return isActive(explicit, this.now()) ? explicit : null;
    }

    const policies = await this.store.listRankingPolicies();
    const currentTime = this.now();
    return policies.find((policy) => isActive(policy, currentTime)) ?? null;
  }
}
