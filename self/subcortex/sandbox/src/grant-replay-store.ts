/**
 * In-memory anti-replay baseline for capability grants.
 */
export interface GrantReplayStore {
  registerScopedNonce(scopeKey: string, nonce: string): boolean;
  registerGrantNonce(grantId: string, nonce: string): boolean;
}

export class InMemoryGrantReplayStore implements GrantReplayStore {
  private readonly scopedNonces = new Set<string>();
  private readonly grantNonces = new Set<string>();

  registerScopedNonce(scopeKey: string, nonce: string): boolean {
    const key = `${scopeKey}::${nonce}`;
    if (this.scopedNonces.has(key)) {
      return false;
    }
    this.scopedNonces.add(key);
    return true;
  }

  registerGrantNonce(grantId: string, nonce: string): boolean {
    const key = `${grantId}::${nonce}`;
    if (this.grantNonces.has(key)) {
      return false;
    }
    this.grantNonces.add(key);
    return true;
  }
}

