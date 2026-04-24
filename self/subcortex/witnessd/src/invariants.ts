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
 * - `BASE_POLICY['SUP']` fallback at `{ S2, review }` is a safe default for
 *   any un-registered SUP code that somehow reaches the mapper (SUPV-SP4-006-b).
 *   SUP-009..SUP-012 are deliberately NOT registered in SP 4 — SP 6 lands the
 *   `InvariantSeveritySchema`/`EnforcementActionSchema` widening (adds `S3` +
 *   `warn`) alongside explicit SUP-009..SUP-012 rows and removes this
 *   fallback (SUPV-SP4-006 revision).
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

const BASE_POLICY: Record<
  InvariantPrefix,
  { severity: InvariantSeverity; enforcement: EnforcementAction }
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
  // WR-162 SP 4 — SUPV-SP4-006-b. Safe fallback for un-registered SUP codes.
  // Every SUP code defined in SP 4 (SUP-001..SUP-008) has an explicit row in
  // `SUP_POLICY` below and therefore never reaches this fallback in SP 4
  // production paths. SUP-009..SUP-012 are deferred to SP 6 alongside the
  // `InvariantSeveritySchema`/`EnforcementActionSchema` widening that will
  // carry `S3`/`warn`.
  SUP: { severity: 'S2', enforcement: 'review' },
};

/**
 * Per-code supervisor policy (SP 4 scope: SUP-001..SUP-008 only).
 * Kebab-case values per witnessd domain's `EnforcementActionSchema`.
 * Mappings are taken verbatim from `supervisor-violation-taxonomy-v1.md
 * § Invariant Code Catalog` (cross-referenced to
 * `supervisor-evidence-contract-v1.md § Invariant-to-Severity Mappings`):
 *
 *   SUP-001  S0  hard-stop   Worker agent-dispatch
 *   SUP-002  S0  hard-stop   Worker→Principal routing
 *   SUP-003  S1  auto-pause  Scope-boundary tool call
 *   SUP-004  S1  auto-pause  Missing authorization evidence
 *   SUP-005  S1  auto-pause  Budget exhausted
 *   SUP-006  S1  auto-pause  Spawn-ceiling breach
 *   SUP-007  S0  hard-stop   Witness chain break
 *   SUP-008  S1  auto-pause  Missing lifecycle predecessor
 *
 * SUP-009..SUP-012 are NOT in this table — SP 6 lands them alongside the
 * `S3`/`warn` schema widening.
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
});

export function getInvariantPrefix(code: InvariantCode): InvariantPrefix {
  return code.split('-')[0] as InvariantPrefix;
}

export function mapInvariantToEnforcement(
  code: InvariantCode,
): InvariantEnforcementDecision {
  const prefix = getInvariantPrefix(code);
  const base = BASE_POLICY[prefix];

  // WR-162 SP 4 — supervisor per-code lookup (SUPV-SP4-006 revised).
  // SUP-001..SUP-008 have explicit rows; SUP-009..SUP-012 fall through to
  // BASE_POLICY['SUP'] (SUPV-SP4-006-b) until SP 6 widens the schemas and
  // registers them explicitly.
  if (prefix === 'SUP') {
    const supRow = SUP_POLICY[code];
    if (supRow) {
      return InvariantEnforcementDecisionSchema.parse({
        code,
        severity: supRow.severity,
        enforcement: supRow.enforcement,
      });
    }
    return InvariantEnforcementDecisionSchema.parse({
      code,
      severity: base.severity,
      enforcement: base.enforcement,
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
