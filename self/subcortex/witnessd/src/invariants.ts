/**
 * Invariant mapping logic for witness enforcement decisions.
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
  EVID: { severity: 'S1', enforcement: 'auto-pause' },
  MEM: { severity: 'S2', enforcement: 'review' },
  PRV: { severity: 'S1', enforcement: 'auto-pause' },
};

export function getInvariantPrefix(code: InvariantCode): InvariantPrefix {
  return code.split('-')[0] as InvariantPrefix;
}

export function mapInvariantToEnforcement(
  code: InvariantCode,
): InvariantEnforcementDecision {
  const prefix = getInvariantPrefix(code);
  const base = BASE_POLICY[prefix];

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
