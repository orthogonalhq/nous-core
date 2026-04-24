/**
 * Invariant mapping logic for witness enforcement decisions.
 *
 * WR-162 SP 4 (per `supervisor-evidence-contract-v1.md § Invariant-to-Severity
 * Mappings` and SDS § Boundaries § Interfaces item 5 revised cycle 2):
 * - `SUP_POLICY` per-code table for SUP-001..SUP-008 (the eight deterministic
 *   detectors landed in SP 4). Values are kebab-case per witnessd's
 *   `EnforcementActionSchema` domain; the supervisor domain uses snake_case
 *   (`hard_stop`/`auto_pause`) and is translated at the seam via
 *   `@nous/subcortex-supervisor`'s `enforcement-action-translator.ts`
 *   (SUPV-SP4-011).
 *
 * WR-162 SP 6 (SUPV-SP6-009 Option A) — SUP-009..SUP-012 registered here with
 * `{ severity: 'S3', enforcement: 'warn' }` matching the SP 1 authoritative
 * `SUPERVISOR_INVARIANT_SEVERITY_MAP` at
 * `self/shared/src/types/supervisor-invariants.ts:56–59` verbatim. The SP 4
 * `BASE_POLICY['SUP']` wildcard fallback is REMOVED; unknown SUP codes now
 * return undefined from `SUP_POLICY[code]` and flow through the `base.severity`
 * / `base.enforcement` path — but since the prefix `'SUP'` is no longer in
 * `BASE_POLICY`, `base` is `undefined` for unregistered supervisor codes and
 * the mapper rejects the lookup (contract tightening per SUPV-SP6-009 audit).
 */
import type {
  EnforcementAction,
  InvariantCode,
  InvariantEnforcementDecision,
  InvariantFinding,
  InvariantPrefix,
  InvariantSeverity,
  WitnessEventId,
} from '@nous/shared';
import { InvariantEnforcementDecisionSchema } from '@nous/shared';

// WR-162 SP 6 (SUPV-SP6-009) — `BASE_POLICY` uses a partial record because the
// SP 4 `SUP` wildcard fallback is removed; unregistered SUP codes flow into
// `mapInvariantToEnforcement` through the per-code `SUP_POLICY` lookup which
// now carries SUP-001..SUP-012 explicitly and rejects unknown SUP codes at the
// parse boundary (contract tightening per Goals SC 7 row 5).
const BASE_POLICY: Partial<
  Record<InvariantPrefix, { severity: InvariantSeverity; enforcement: EnforcementAction }>
> = {
  AUTH: { severity: 'S0', enforcement: 'hard-stop' },
  CHAIN: { severity: 'S0', enforcement: 'hard-stop' },
  ISO: { severity: 'S0', enforcement: 'hard-stop' },
  OPCTL: { severity: 'S0', enforcement: 'hard-stop' },
  START: { severity: 'S0', enforcement: 'hard-stop' },
  ESC: { severity: 'S0', enforcement: 'hard-stop' },
  MAO: { severity: 'S0', enforcement: 'hard-stop' },
  GTM: { severity: 'S0', enforcement: 'hard-stop' },
  POL: { severity: 'S2', enforcement: 'review' },
  WMODE: { severity: 'S0', enforcement: 'hard-stop' },
  PCP: { severity: 'S0', enforcement: 'hard-stop' },
  ING: { severity: 'S0', enforcement: 'hard-stop' },
  FR: { severity: 'S0', enforcement: 'hard-stop' },
  EVID: { severity: 'S1', enforcement: 'auto-pause' },
  MEM: { severity: 'S2', enforcement: 'review' },
  PRV: { severity: 'S1', enforcement: 'auto-pause' },
  // WR-162 SP 6 (SUPV-SP6-009) — `SUP` wildcard fallback REMOVED. All SUP
  // codes (SUP-001..SUP-012) are registered explicitly in `SUP_POLICY` below;
  // unknown SUP codes return undefined from the lookup and cause
  // `mapInvariantToEnforcement` to throw via `InvariantEnforcementDecisionSchema.parse`.
};

/**
 * Per-code supervisor policy. WR-162 SP 6 (SUPV-SP6-009) — SUP-009..SUP-012
 * appended with `{ severity: 'S3', enforcement: 'warn' }` matching the SP 1
 * authoritative `SUPERVISOR_INVARIANT_SEVERITY_MAP` at
 * `self/shared/src/types/supervisor-invariants.ts:56–59` verbatim (single
 * source of truth preserved). Post-registration, the `BASE_POLICY['SUP']`
 * wildcard is removed; unknown SUP codes are rejected at invariant lookup.
 * Kebab-case values per witnessd domain's `EnforcementActionSchema`.
 *
 * Mappings are taken verbatim from `supervisor-violation-taxonomy-v1.md
 * § Invariant Code Catalog`:
 *
 *   SUP-001  S0  hard-stop   Worker agent-dispatch
 *   SUP-002  S0  hard-stop   Worker→Principal routing
 *   SUP-003  S1  auto-pause  Scope-boundary tool call
 *   SUP-004  S1  auto-pause  Missing authorization evidence
 *   SUP-005  S1  auto-pause  Budget exhausted
 *   SUP-006  S1  auto-pause  Spawn-ceiling breach
 *   SUP-007  S0  hard-stop   Witness chain break
 *   SUP-008  S1  auto-pause  Missing lifecycle predecessor
 *   SUP-009  S3  warn        Excessive retry pattern (SP 6 sentinel)
 *   SUP-010  S3  warn        Escalation storm (SP 6 sentinel)
 *   SUP-011  S3  warn        Stalled agent (SP 6 sentinel)
 *   SUP-012  S3  warn        Anomalous tool-usage pattern (SP 6 sentinel)
 */
const SUP_POLICY: Readonly<
  Record<string, { severity: InvariantSeverity; enforcement: EnforcementAction }>
> = Object.freeze({
  'SUP-001': { severity: 'S0', enforcement: 'hard-stop' },
  'SUP-002': { severity: 'S0', enforcement: 'hard-stop' },
  'SUP-003': { severity: 'S1', enforcement: 'auto-pause' },
  'SUP-004': { severity: 'S1', enforcement: 'auto-pause' },
  'SUP-005': { severity: 'S1', enforcement: 'auto-pause' },
  'SUP-006': { severity: 'S1', enforcement: 'auto-pause' },
  'SUP-007': { severity: 'S0', enforcement: 'hard-stop' },
  'SUP-008': { severity: 'S1', enforcement: 'auto-pause' },
  // WR-162 SP 6 (SUPV-SP6-009) — SUP-009..SUP-012 sentinel S3 warn tier.
  'SUP-009': { severity: 'S3', enforcement: 'warn' },
  'SUP-010': { severity: 'S3', enforcement: 'warn' },
  'SUP-011': { severity: 'S3', enforcement: 'warn' },
  'SUP-012': { severity: 'S3', enforcement: 'warn' },
});

export function getInvariantPrefix(code: InvariantCode): InvariantPrefix {
  return code.split('-')[0] as InvariantPrefix;
}

export function mapInvariantToEnforcement(
  code: InvariantCode,
): InvariantEnforcementDecision {
  const prefix = getInvariantPrefix(code);
  const base = BASE_POLICY[prefix];

  // WR-162 SP 6 (SUPV-SP6-009) — supervisor per-code lookup with wildcard
  // removed. SUP-001..SUP-012 have explicit rows in `SUP_POLICY`; unknown
  // SUP codes reject at `.parse` via the undefined lookup (severity required
  // field missing). This is the intended contract tightening.
  if (prefix === 'SUP') {
    const supRow = SUP_POLICY[code];
    if (supRow) {
      return InvariantEnforcementDecisionSchema.parse({
        code,
        severity: supRow.severity,
        enforcement: supRow.enforcement,
      });
    }
    // No fallback — parse intentionally fails for unknown SUP codes.
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: undefined,
      enforcement: undefined,
    });
  }

  // Non-SUP prefixes still require a base policy entry; a missing base is
  // a contract-level defect that surfaces as a parse failure.
  if (base === undefined) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: undefined,
      enforcement: undefined,
    });
  }

  // Memory authority violations are stronger than general review findings.
  if (prefix === 'MEM' && code.includes('AUTHORITY')) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  }

  // Evidence integrity can be promoted to S0 when explicitly tagged.
  if (prefix === 'EVID' && code.includes('INTEGRITY')) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  }

  // ING-002, ING-003, ING-004: S1 (auto-pause)
  if (
    prefix === 'ING' &&
    (code.startsWith('ING-002') ||
      code.startsWith('ING-003') ||
      code.startsWith('ING-004'))
  ) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  }

  // ING-005: S2 (review)
  if (prefix === 'ING' && code.startsWith('ING-005')) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: 'S2',
      enforcement: 'review',
    });
  }

  // FR-003, FR-005, FR-006, FR-007, FR-008, FR-009: S1 (auto-pause)
  if (
    prefix === 'FR' &&
    (code.startsWith('FR-003') ||
      code.startsWith('FR-005') ||
      code.startsWith('FR-006') ||
      code.startsWith('FR-007') ||
      code.startsWith('FR-008') ||
      code.startsWith('FR-009'))
  ) {
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  }

  return InvariantEnforcementDecisionSchema.parse({
    code,
    severity: base.severity,
    enforcement: base.enforcement,
  });
}

export function createInvariantFinding(params: {
  code: InvariantCode;
  description: string;
  evidenceEventIds: WitnessEventId[];
  detectedAt: string;
}): InvariantFinding {
  const mapped = mapInvariantToEnforcement(params.code);
  return {
    code: mapped.code,
    severity: mapped.severity,
    enforcement: mapped.enforcement,
    description: params.description,
    evidenceEventIds: params.evidenceEventIds,
    detectedAt: params.detectedAt,
  };
}
