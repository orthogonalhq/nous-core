/**
 * WR-162 SP 5 — supervisor enforcement module (SUPV-SP5-002 .. SUPV-SP5-013).
 *
 * The production enforcement path: converts a finalized violation into a
 * supervisor-actor control command, issues a supervisor-tier proof, submits
 * it to `OpctlService.submitCommand`, inspects the three ratified
 * `OpctlSubmitResult.status` branches exhaustively, and emits the paired
 * witness row + EventBus payload. This module is the **first production
 * caller** of `emitEnforcementWitness` (SUPV-SP4-010 resolution).
 *
 * Policy citations (authoritative):
 *   - `supervisor-escalation-policy-v1.md § Enforcement Delegation Pattern` —
 *     the 8-step enforcement body implemented below.
 *   - `supervisor-evidence-contract-v1.md § EventBus Channel Contract` —
 *     payload shape for `supervisor:enforcement-action`.
 *   - `supervisor-scope-boundary-v1.md` — scope derivation from violation
 *     identity.
 *
 * Invariants (authoritative in SDS § Invariants):
 *   - SUPV-SP5-001 (no second gate) — this module performs NO
 *     `config.enabled` check. The single gate sits at
 *     `SupervisorService.runClassifier` (SUPV-SP3-002 / SP 4 invariant).
 *     Grep evidence recorded in CR.
 *   - SUPV-SP5-002 (translator reuse) — severity → action mapping reads
 *     `SUPERVISOR_INVARIANT_SEVERITY_MAP` directly; kebab-case conversion
 *     goes through the SP 4 `toWitnessdEnforcement` translator
 *     (single-site enum bridge). No inline duplication.
 *   - SUPV-SP5-003 (S3 short-circuit) — S3 violations return
 *     `{ status: 'warn_only' }` WITHOUT calling the translator, opctl,
 *     witness, or EventBus.
 *   - SUPV-SP5-004 — proof-issuance is DI-seamed via `ProofIssuer`;
 *     bootstrap wires `issueSupervisorProof` (path (b)). Swap to
 *     `issueSystemProof` at SP 7 is a one-line bootstrap rename.
 *   - SUPV-SP5-013 (no heuristic bandaids) — the switch over
 *     `OpctlSubmitResult.status` is EXHAUSTIVE on the ratified three-
 *     branch enum (`'applied' | 'blocked' | 'rejected'`). Unknown
 *     values throw `EnforcementContractDefectError`; the caller's
 *     `processRecord` try/catch surfaces the defect via metric + log
 *     per `feedback_no_heuristic_bandaids.md` — fix the source, not
 *     the symptom.
 *
 * S2 / V1 consumer-path (review N1):
 *   `SupervisorEnforcementActionPayloadSchema` in `self/shared/src/event-bus/
 *   types.ts` currently constrains `severity: z.enum(['S0','S1'])` and
 *   `action: z.enum(['hard_stop','auto_pause'])`. S2 severity (with action
 *   `'stop_response'`) would fail `.parse(...)` at the EventBus layer. SP 5
 *   skips the EventBus emit on S2 and records the skip via metric; SP 6
 *   widens the schema. Witness emission still happens for S2 (step 8).
 */
import { randomUUID, createHash } from 'node:crypto';
import {
  SUPERVISOR_INVARIANT_SEVERITY_MAP,
  type ConfirmationProof,
  type ControlAction,
  type ControlCommandEnvelope,
  type ControlScope,
  type IEventBus,
  type ILogChannel,
  type IWitnessService,
  type OpctlSubmitResult,
  type SupervisorEnforcementActionPayload,
  type SupervisorInvariantCode,
  type SupervisorViolationRecord,
} from '@nous/shared';
import { emitEnforcementWitness } from './witness-emission.js';
import { toWitnessdEnforcement } from './enforcement-action-translator.js';
import type { SupervisorEnforcementActionSP4 } from './enforcement-action-translator.js';

/**
 * Minimal opctl-service shape the enforcement module depends on. Kept
 * structural (not a class import) so test harnesses and bootstrap can
 * both satisfy it.
 */
export interface EnforcementOpctlService {
  submitCommand(
    envelope: ControlCommandEnvelope,
    proof?: ConfirmationProof,
  ): Promise<OpctlSubmitResult>;
}

/**
 * SUPV-SP5-004 — proof-issuance DI seam. `enforce(...)` never imports
 * `issueSupervisorProof` directly; bootstrap wires the closure so
 * migration to `issueSystemProof` at SP 7 is a one-line edit.
 */
export type ProofIssuer = (args: {
  action: ControlAction;
  scope: ControlScope;
}) => ConfirmationProof;

export type EnforcementMetric = (
  name: string,
  labels: Readonly<Record<string, string>>,
) => void;

export interface EnforcementDeps {
  readonly opctlService: EnforcementOpctlService;
  readonly witnessService: IWitnessService;
  readonly eventBus: IEventBus;
  readonly logger?: ILogChannel;
  readonly proofIssuer: ProofIssuer;
  readonly metric?: EnforcementMetric;
  readonly now?: () => Date;
  readonly newCommandId?: () => string;
  readonly newNonce?: () => string;
  readonly actorId: string;
  readonly actorSessionId: string;
  readonly nextActorSeq: () => number;
}

/**
 * Discriminated union for `enforce(...)` return values.
 *
 * `applied` / `conflict_resolved` / `rejected` match the three ratified
 * `OpctlSubmitResult.status` branches; `warn_only` is the S3 short-
 * circuit carry-forward; `preflight_rejected` is reserved for future
 * opctl preflight checks (not triggered in SP 5).
 */
export type EnforcementResult =
  | {
      readonly status: 'applied';
      readonly commandId: string;
      readonly action: ControlAction;
    }
  | {
      readonly status: 'conflict_resolved';
      readonly commandId: string;
      readonly action: ControlAction;
      readonly reasonCode: string;
      readonly holderAction?: string;
    }
  | {
      readonly status: 'rejected';
      readonly commandId: string;
      readonly action: ControlAction;
      readonly reasonCode: string;
    }
  | {
      readonly status: 'warn_only';
      readonly supCode: string;
      readonly reason: 'S3_sentinel_deferred_to_SP6';
    }
  | {
      readonly status: 'preflight_rejected';
      readonly supCode: string;
      readonly reasonCode: string;
    };

/**
 * Thrown by `enforce(...)` when `OpctlSubmitResult.status` is outside the
 * ratified three-branch enum. The caller (`SupervisorService.processRecord`)
 * catches this via its top-level try/catch (SUPV-SP5-005) and emits a
 * metric + log — no silent `default: no-op`, no heuristic fallback.
 * The contract defect is surfaced as `execution_blocked` with
 * `blocker_type: design` per `feedback_no_heuristic_bandaids.md`.
 */
export class EnforcementContractDefectError extends Error {
  public readonly kind = 'contract_defect' as const;
  public readonly detail: { reason: string; status: unknown };
  constructor(detail: { reason: string; status: unknown }) {
    super(
      `EnforcementContractDefectError: ${detail.reason} (status=${String(
        detail.status,
      )})`,
    );
    this.detail = detail;
    this.name = 'EnforcementContractDefectError';
  }
}

/**
 * SUPV-SP5-002 — supervisor snake_case → opctl `ControlAction` rename map.
 * Feeds through the SP 4 `toWitnessdEnforcement` translator first so the
 * kebab-case bridge stays the single reconciliation site; this map then
 * lands the result in opctl's domain (supervisor's `auto_pause` becomes
 * opctl's `pause`; `hard_stop` stays `hard_stop`).
 */
const WITNESSD_TO_OPCTL_ACTION: Record<string, ControlAction> = {
  'hard-stop': 'hard_stop',
  'auto-pause': 'pause',
  // SP 6 widens to include 'stop-response' → 'stop_response'. Until then
  // we handle S2 through a direct lookup below (supervisor 'stop_response'
  // is opctl 'stop_response' — no kebab trip). `review` not produced by
  // SP 4/SP 5 classifier paths.
};

function severityToOpctlAction(
  violation: SupervisorViolationRecord,
): ControlAction {
  // S2 branch: the SUPERVISOR_INVARIANT_SEVERITY_MAP table does not yet
  // register any SUP code at S2 severity (SP 6 lands SUP-009 +
  // `'require_review' → stop_response` widening). A synthetic S2
  // violation (for testing / future SP 6 preview) maps directly to
  // opctl `stop_response`; we do not route through the SP 4 translator
  // because the witnessd kebab mapping for S2 is not widened yet.
  if (violation.severity === 'S2') {
    return 'stop_response';
  }
  // S0/S1 path: read the ratified policy table (single source of
  // truth). Supervisor snake_case → witnessd kebab-case → opctl
  // ControlAction. The translator throws on 'warn' — which cannot
  // happen here because S3/warn is short-circuited upstream.
  const policy =
    SUPERVISOR_INVARIANT_SEVERITY_MAP[
      violation.supCode as SupervisorInvariantCode
    ];
  if (policy === undefined) {
    throw new EnforcementContractDefectError({
      reason: 'unknown_sup_code',
      status: violation.supCode,
    });
  }
  const supervisorAction = policy.enforcement;
  const kebab = toWitnessdEnforcement(
    supervisorAction as SupervisorEnforcementActionSP4,
  );
  const opctl = WITNESSD_TO_OPCTL_ACTION[kebab];
  if (opctl === undefined) {
    throw new EnforcementContractDefectError({
      reason: 'no_opctl_action_for_kebab',
      status: kebab,
    });
  }
  return opctl;
}

function buildEnvelope(
  violation: SupervisorViolationRecord,
  action: ControlAction,
  deps: EnforcementDeps,
  enforcedAt: string,
): ControlCommandEnvelope {
  const now = deps.now?.() ?? new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000); // 5 min TTL
  const payloadHash = createHash('sha256')
    .update(
      JSON.stringify({
        sup_code: violation.supCode,
        severity: violation.severity,
        run_id: violation.runId,
        agent_id: violation.agentId,
      }),
    )
    .digest('hex');
  const scope: ControlScope = {
    class: 'project_run_scope',
    kind: 'project_run',
    target_ids: [],
    project_id: violation.projectId as import('@nous/shared').ProjectId,
  };
  return {
    control_command_id: (deps.newCommandId?.() ??
      randomUUID()) as import('@nous/shared').ControlCommandId,
    actor_type: 'supervisor',
    actor_id: deps.actorId,
    actor_session_id: deps.actorSessionId,
    actor_seq: deps.nextActorSeq(),
    nonce: deps.newNonce?.() ?? randomUUID(),
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    scope,
    payload_hash: payloadHash,
    command_signature: 'stub-sig',
    action,
    payload: {
      sup_code: violation.supCode,
      severity: violation.severity,
      lock_set_at: enforcedAt,
    },
  };
}

/**
 * WR-162 SP 5 — production enforcement path. See module doc-comment for
 * the authoritative 8-step body; each step below is labeled with its
 * invariant binding.
 */
export async function enforce(
  violation: SupervisorViolationRecord,
  deps: EnforcementDeps,
): Promise<EnforcementResult> {
  // Step 1 — SUPV-SP5-003: S3 short-circuit.
  if (violation.severity === 'S3') {
    return {
      status: 'warn_only',
      supCode: violation.supCode,
      reason: 'S3_sentinel_deferred_to_SP6',
    };
  }

  const enforcedAt = (deps.now?.() ?? new Date()).toISOString();

  // Step 2 — SUPV-SP5-002: severity → action via translator + rename map.
  const action = severityToOpctlAction(violation);

  // Step 3: envelope construction (Identity-Completeness Gate upstream
  // guarantees non-null identity fields on the violation record).
  const envelope = buildEnvelope(violation, action, deps, enforcedAt);

  // Step 4 — SUPV-SP5-004: issue proof via DI seam.
  const proof = deps.proofIssuer({ action, scope: envelope.scope });

  // Step 5: submit.
  const result = await deps.opctlService.submitCommand(envelope, proof);

  // Step 6 — SUPV-SP5-013: exhaustive switch on ratified enum.
  let enforcementResult: EnforcementResult;
  let reasonCodeForTrails: string | undefined;
  switch (result.status) {
    case 'applied': {
      enforcementResult = {
        status: 'applied',
        commandId: envelope.control_command_id,
        action,
      };
      reasonCodeForTrails = undefined;
      break;
    }
    case 'blocked': {
      const reasonCode = result.reason_code ?? 'unknown_blocked_reason';
      if (reasonCode === 'opctl_conflict_resolved') {
        enforcementResult = {
          status: 'conflict_resolved',
          commandId: envelope.control_command_id,
          action,
          reasonCode,
          // holderAction is not carried on OpctlSubmitResult; surfaced
          // via the reason message. SP 6 may promote it to a field.
        };
      } else {
        enforcementResult = {
          status: 'rejected',
          commandId: envelope.control_command_id,
          action,
          reasonCode,
        };
      }
      reasonCodeForTrails = reasonCode;
      break;
    }
    case 'rejected': {
      const reasonCode = result.reason_code ?? 'unknown_rejected_reason';
      enforcementResult = {
        status: 'rejected',
        commandId: envelope.control_command_id,
        action,
        reasonCode,
      };
      reasonCodeForTrails = reasonCode;
      break;
    }
    default: {
      throw new EnforcementContractDefectError({
        reason: 'unknown_opctl_submit_status',
        status: (result as { status: unknown }).status,
      });
    }
  }

  // Step 7 — SUPV-SP5-002 EventBus emit. WR-162 SP 6 (SUPV-SP6-008) widened
  // `SupervisorEnforcementActionPayloadSchema.severity` to include `'S2'` and
  // `action` to include `'stop_response'`; the SP 5 V1 S2 skip branch is
  // removed — S2 emits flow through end-to-end post-widening.
  const isSupportedSeverity =
    violation.severity === 'S0' ||
    violation.severity === 'S1' ||
    violation.severity === 'S2';
  if (isSupportedSeverity) {
    const publishPayload: SupervisorEnforcementActionPayload = {
      sup_code: violation.supCode,
      severity: violation.severity as 'S0' | 'S1' | 'S2',
      // Opctl `ControlAction` → payload action (snake_case supervisor domain):
      // opctl `pause` → payload `auto_pause`; `hard_stop` stays; `stop_response` stays.
      action:
        action === 'hard_stop'
          ? 'hard_stop'
          : action === 'stop_response'
            ? 'stop_response'
            : 'auto_pause',
      scope: JSON.stringify(envelope.scope),
      command_id: envelope.control_command_id,
      agent_id: violation.agentId,
      run_id: violation.runId,
      project_id: violation.projectId,
      evidence_refs: [...violation.evidenceRefs],
      enforced_at: enforcedAt,
    };
    try {
      deps.eventBus.publish('supervisor:enforcement-action', publishPayload);
    } catch (err) {
      deps.logger?.warn?.('supervisor.enforcement_eventbus_failed', {
        sup_code: violation.supCode,
        err: err instanceof Error ? err.message : String(err),
      });
      deps.metric?.('supervisor_enforcement_eventbus_failed_total', {
        sup_code: violation.supCode,
      });
    }
  }

  // Step 8: witness emission. Runs AFTER submit so a throw in submit
  // produces no enforcement witness row. SUPV-SP5-005 / review N2: the
  // pre-submit `enforcement_attempt` witness row is a future ADR
  // candidate; SP 5 ships without it.
  if (
    enforcementResult.status === 'applied' ||
    enforcementResult.status === 'conflict_resolved' ||
    enforcementResult.status === 'rejected'
  ) {
    try {
      const witnessAction =
        action === 'hard_stop' ? 'hard_stop' : 'auto_pause';
      await emitEnforcementWitness({
        supCode: violation.supCode,
        severity: violation.severity,
        action: witnessAction,
        commandId: envelope.control_command_id,
        agentId: violation.agentId,
        agentClass: violation.agentClass,
        runId: violation.runId,
        projectId: violation.projectId,
        evidenceRefs: [...violation.evidenceRefs, ...(reasonCodeForTrails ? [reasonCodeForTrails] : [])],
        enforcedAt,
        witnessService: deps.witnessService,
      });
    } catch (err) {
      deps.logger?.warn?.('supervisor.enforcement_witness_failed', {
        sup_code: violation.supCode,
        err: err instanceof Error ? err.message : String(err),
      });
      deps.metric?.('supervisor_enforcement_witness_failed_total', {
        sup_code: violation.supCode,
      });
    }
  }

  return enforcementResult;
}
