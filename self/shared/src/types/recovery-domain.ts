/**
 * Failure domain taxonomy for Nous-OSS recovery.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';

export const RecoveryDomainSchema = z.enum([
  'step_domain',
  'agent_domain',
  'agent_set_domain',
  'project_run_domain',
  'runtime_domain',
]);
export type RecoveryDomain = z.infer<typeof RecoveryDomainSchema>;
