/**
 * Recovery domain schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryDomainSchema } from '../../types/recovery-domain.js';

describe('RecoveryDomainSchema', () => {
  it('accepts all domain values', () => {
    expect(RecoveryDomainSchema.safeParse('step_domain').success).toBe(true);
    expect(RecoveryDomainSchema.safeParse('agent_domain').success).toBe(true);
    expect(RecoveryDomainSchema.safeParse('agent_set_domain').success).toBe(true);
    expect(RecoveryDomainSchema.safeParse('project_run_domain').success).toBe(
      true,
    );
    expect(RecoveryDomainSchema.safeParse('runtime_domain').success).toBe(true);
  });

  it('rejects invalid domain', () => {
    expect(RecoveryDomainSchema.safeParse('invalid').success).toBe(false);
  });
});
