/**
 * Supervisor invariant constant tables (WR-162 SP 1).
 *
 * Canonical sources:
 * - supervisor-violation-taxonomy-v1.md § Invariant Code Catalog —
 *   SUP-001..SUP-012 with severity ladder (S0..S3).
 * - supervisor-evidence-contract-v1.md § Invariant-to-Severity Mappings
 *   and § New CriticalActionCategory Values.
 *
 * Types-only: these const tables are consumed at runtime by SP 4
 * (witnessd invariant registration) and at type level throughout.
 * SP 1 only exports them.
 */
import type {
  SupervisorEnforcementAction,
  SupervisorSeverity,
} from './supervisor.js';

// Ordered, exhaustive SUP code list (SUP-001..SUP-012).
export const SUPERVISOR_INVARIANT_CODES = [
  'SUP-001',
  'SUP-002',
  'SUP-003',
  'SUP-004',
  'SUP-005',
  'SUP-006',
  'SUP-007',
  'SUP-008',
  'SUP-009',
  'SUP-010',
  'SUP-011',
  'SUP-012',
] as const;

export type SupervisorInvariantCode =
  (typeof SUPERVISOR_INVARIANT_CODES)[number];

/**
 * Severity + enforcement mapping per
 * supervisor-violation-taxonomy-v1.md § Invariant Code Catalog and
 * supervisor-evidence-contract-v1.md § Invariant-to-Severity Mappings.
 *
 * The `satisfies` clause enforces compile-time exhaustiveness: adding a
 * new SUP code to SUPERVISOR_INVARIANT_CODES without updating this map
 * fails typecheck.
 */
export const SUPERVISOR_INVARIANT_SEVERITY_MAP = {
  'SUP-001': { severity: 'S0', enforcement: 'hard_stop' },
  'SUP-002': { severity: 'S0', enforcement: 'hard_stop' },
  'SUP-003': { severity: 'S1', enforcement: 'auto_pause' },
  'SUP-004': { severity: 'S1', enforcement: 'auto_pause' },
  'SUP-005': { severity: 'S1', enforcement: 'auto_pause' },
  'SUP-006': { severity: 'S1', enforcement: 'auto_pause' },
  'SUP-007': { severity: 'S0', enforcement: 'hard_stop' },
  'SUP-008': { severity: 'S1', enforcement: 'auto_pause' },
  'SUP-009': { severity: 'S3', enforcement: 'warn' },
  'SUP-010': { severity: 'S3', enforcement: 'warn' },
  'SUP-011': { severity: 'S3', enforcement: 'warn' },
  'SUP-012': { severity: 'S3', enforcement: 'warn' },
} as const satisfies Record<
  SupervisorInvariantCode,
  { severity: SupervisorSeverity; enforcement: SupervisorEnforcementAction }
>;

/**
 * CriticalActionCategory values introduced by supervisor v1.
 * Per supervisor-evidence-contract-v1.md § New CriticalActionCategory Values.
 */
export const SUPERVISOR_CRITICAL_ACTION_CATEGORIES = [
  'supervisor-detection',
  'supervisor-enforcement',
] as const;

export type SupervisorCriticalActionCategory =
  (typeof SUPERVISOR_CRITICAL_ACTION_CATEGORIES)[number];
