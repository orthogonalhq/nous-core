/**
 * WR-162 SP 4 — Dual witness trail emission helpers.
 *
 * SDS § Data Model § `emitDetectionWitness` + `emitEnforcementWitness`
 * signatures. `emitDetectionWitness` is called from
 * `SupervisorService.runClassifier` on every detection.
 * `emitEnforcementWitness` exists but is NOT called from SP 4 production
 * code (SUPV-SP4-010 floor — CR grep evidences this). SP 5 threads the
 * real enforcement call site.
 *
 * Both helpers consume the existing `IWitnessService.appendInvariant`
 * surface — hash chaining, key-epoch signing, and ledger head management
 * remain witnessd's responsibility (CHAIN-001 / EVID-001 preserved).
 */
import type {
  IWitnessService,
  InvariantCode,
  SupervisorEnforcementAction,
  SupervisorSeverity,
  SupervisorViolationRecord,
  WitnessEventId,
} from '@nous/shared';

export interface EmitDetectionWitnessArgs {
  readonly violation: SupervisorViolationRecord;
  readonly reason?: string;
  readonly evidenceFromDetector?: Readonly<Record<string, unknown>>;
  readonly witnessService: IWitnessService;
}

export async function emitDetectionWitness(
  args: EmitDetectionWitnessArgs,
): Promise<WitnessEventId> {
  const { violation, witnessService } = args;
  const event = await witnessService.appendInvariant({
    code: violation.supCode as InvariantCode,
    actionCategory: 'supervisor-detection',
    actionRef: `${violation.supCode}-${violation.runId}`,
    actor: 'system',
    detail: {
      severity: violation.severity,
      agentId: violation.agentId,
      agentClass: violation.agentClass,
      runId: violation.runId,
      projectId: violation.projectId,
      // SUPV-SP4-008 forward-compat breadcrumb. SP 5 widens
      // `WitnessActorSchema` to include 'supervisor' and flips `actor`.
      supervisorActor: 'supervisor',
      reason: args.reason ?? '',
      evidenceFromDetector: args.evidenceFromDetector ?? {},
    },
    occurredAt: violation.detectedAt,
  });
  return event.id;
}

export interface EmitEnforcementWitnessArgs {
  readonly supCode: string;
  readonly severity: SupervisorSeverity;
  readonly action: Extract<SupervisorEnforcementAction, 'hard_stop' | 'auto_pause'>;
  readonly commandId: string;
  readonly agentId: string | null;
  readonly agentClass: string | null;
  readonly runId: string | null;
  readonly projectId: string | null;
  readonly evidenceRefs: readonly string[];
  readonly enforcedAt: string;
  readonly witnessService: IWitnessService;
}

/**
 * Enforcement witness emission helper. SP 4 exports this but does NOT
 * invoke it from production code paths (SUPV-SP4-010). SP 5's enforcement
 * wiring is the first production caller. A direct unit test (UT-W2)
 * exercises the helper.
 */
export async function emitEnforcementWitness(
  args: EmitEnforcementWitnessArgs,
): Promise<WitnessEventId> {
  const event = await args.witnessService.appendInvariant({
    code: args.supCode as InvariantCode,
    actionCategory: 'supervisor-enforcement',
    actionRef: `${args.supCode}-${args.commandId}`,
    actor: 'system',
    detail: {
      severity: args.severity,
      action: args.action,
      commandId: args.commandId,
      agentId: args.agentId,
      agentClass: args.agentClass,
      runId: args.runId,
      projectId: args.projectId,
      supervisorActor: 'supervisor',
      evidenceRefs: [...args.evidenceRefs],
    },
    occurredAt: args.enforcedAt,
  });
  return event.id;
}
